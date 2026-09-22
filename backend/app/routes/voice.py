from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.config import GROQ_API_KEY, PINTEREST_ACCESS_TOKEN, PINTEREST_COUNTRY_CODE, PINTEREST_LOCALE

from html.parser import HTMLParser
from io import BytesIO
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from fastapi.responses import StreamingResponse

router = APIRouter()


class _PinterestMetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.image_url = None
        self.title = None
        self._capture_title = False
        self._title_parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            prop = (attrs.get('property') or attrs.get('name') or '').lower()
            content = attrs.get('content')
            if content and prop in ('og:image', 'twitter:image', 'twitter:image:src') and not self.image_url:
                self.image_url = content
            if content and prop == 'og:title' and not self.title:
                self.title = content
        elif tag == 'title':
            self._capture_title = True

    def handle_endtag(self, tag):
        if tag == 'title':
            self._capture_title = False
            value = ''.join(self._title_parts).strip()
            if value and not self.title:
                self.title = value

    def handle_data(self, data):
        if self._capture_title:
            self._title_parts.append(data)


def _resolve_pinterest_preview(pin_url: str) -> dict:
    parsed = urlparse(pin_url)
    host = (parsed.hostname or '').lower()
    if not (host == 'pinterest.com' or host.endswith('.pinterest.com') or host == 'pin.it'):
        raise HTTPException(status_code=400, detail='Only Pinterest Pin URLs are supported.')

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    # Follow short pin.it links first so the preview works for both short and
    # regular Pinterest URLs. urlopen follows normal HTTP redirects for us.
    request = Request(pin_url, headers=headers)
    try:
        with urlopen(request, timeout=15) as response:
            final_url = response.geturl() or pin_url
            content_type = (response.headers.get('Content-Type') or '').lower()
            html = response.read(2_000_000).decode('utf-8', errors='ignore') if 'text' in content_type or 'html' in content_type else ''
        parser = _PinterestMetaParser()
        if html:
            parser.feed(html)
        if parser.image_url:
            return {'pin_url': final_url, 'image_url': parser.image_url, 'title': parser.title or ''}
    except Exception:
        final_url = pin_url

    # Retry the canonical Pinterest URL when the first request was a short-link
    # or Pinterest returned a partial page.
    if final_url != pin_url and 'pinterest.' in final_url:
        try:
            request = Request(final_url, headers=headers)
            with urlopen(request, timeout=15) as response:
                html = response.read(2_000_000).decode('utf-8', errors='ignore')
            parser = _PinterestMetaParser()
            parser.feed(html)
            if parser.image_url:
                return {'pin_url': final_url, 'image_url': parser.image_url, 'title': parser.title or ''}
        except Exception:
            pass

    raise HTTPException(status_code=404, detail='Pinterest preview image could not be resolved for this Pin.')


@router.get('/pinterest-preview-image')
def pinterest_preview_image(url: str = Query(..., min_length=10)):
    """Proxy a Pinterest Pin image through the backend so dashboards can render it
    even when the original image host blocks direct browser/hotlink requests."""
    preview = _resolve_pinterest_preview(url)
    image_url = preview['image_url']
    request = Request(
        image_url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
            'Referer': preview['pin_url'],
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            content_type = response.headers.get('Content-Type') or 'image/jpeg'
            data = response.read(8_000_000)
    except Exception as exc:
        raise HTTPException(status_code=404, detail='Pinterest image could not be loaded.') from exc
    if not data:
        raise HTTPException(status_code=404, detail='Pinterest image could not be loaded.')
    return StreamingResponse(BytesIO(data), media_type=content_type.split(';', 1)[0])


class ExtractRequest(BaseModel):
    transcript: str


class DesignConceptRequest(BaseModel):
    item: str
    material: str
    weight: str | None = None
    stones: str | None = None
    notes: str | None = None
    customer_brief: str | None = None


def _get_client():
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not configured. Add it to backend/.env to enable voice AI."
        )
    from groq import Groq
    return Groq(api_key=GROQ_API_KEY)


@router.post('/transcribe')
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe a browser-recorded audio file using Groq-hosted Whisper."""
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail='The recorded audio is empty.')

        client = _get_client()
        filename = file.filename or 'workloom-voice.webm'

        result = client.audio.transcriptions.create(
            model='whisper-large-v3-turbo',
            file=(filename, content),
            response_format='json',
            temperature=0,
            prompt=(
                'Jewellery workshop vocabulary: karigar, gold, 22 carat, 18 carat, '
                'ring, necklace, bracelet, bangle, pendant, stones, diamond, grams, '
                'finishing, polishing, setting, casting, due date, advance.'
            ),
        )
        transcript = getattr(result, 'text', '') or ''
        transcript = transcript.strip()
        if not transcript:
            raise HTTPException(status_code=422, detail='No speech was detected. Please record again.')
        return {'transcript': transcript}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Voice transcription failed: {exc}')


@router.post('/extract')
def extract_order_fields(payload: ExtractRequest):
    """Extract structured jewellery order fields from the transcript using Groq."""
    if not payload.transcript.strip():
        raise HTTPException(status_code=400, detail='Transcript cannot be empty.')

    try:
        client = _get_client()
        import json
        response = client.chat.completions.create(
            model='openai/gpt-oss-20b',
            temperature=0,
            response_format={'type': 'json_object'},
            messages=[
                {
                    'role': 'system',
                    'content': (
                        'You extract jewellery workshop order information from natural spoken language. Return JSON with two top-level keys: fields and validation. '
                        'fields must contain exactly: customer_name, item, material, weight, stones, karigar, priority, due_date, advance, estimate_value, notes. '
                        'Use null when a value is not present. Never invent values. Keep numeric fields numeric when clearly stated. '
                        'ITEM RULES: normalize common jewellery words to title case (ring, necklace, bracelet, bangle, pendant, chain, anklet, nose pin, mangalsutra). '
                        'MATERIAL RULES: preserve metal and purity, e.g. 18k gold -> Gold 18K, 22 carat gold -> Gold 22K. '
                        'STONE RULES: explicitly extract every named stone/material from the transcript. If the transcript says diamond, diamonds, diamond ring, solitaire diamond, ruby, emerald, sapphire, kundan, polki, pearl, or cubic zirconia, populate stones with the named stone; do not leave stones null when a stone is explicitly mentioned. '
                        'DESIGN NOTES RULES: notes should be a concise, complete brief for the karigar. Include the jewellery item and any explicitly named stone when they are relevant to the design, followed by the actual design/manufacturing requirements stated by the customer, especially adjectives, shape, thickness, style, setting, finish, engraving, pattern, stone placement, and other visual constraints. Avoid duplicating material and weight when those are already separate structured fields. For example, for "sleek diamond ring, very thin metal body, approximately 6 grams, gold 18k", notes should include "Diamond ring; sleek; very thin metal body" and stones should be Diamond. '
                        'If multiple distinct design requirements are present, combine them into one concise notes string separated by semicolons. Do not invent design requirements. '
                        'validation must contain missing_fields (array of important fields missing for production), confidence (object mapping each field to a number 0-1), warnings (array of short warnings), and needs_review (boolean). Treat customer_name, item, material, weight, and due_date as core fields. '
                        'If a core field is absent, needs_review must be true. Confidence must reflect how explicitly the transcript supports the value.'
                    ),
                },
                {'role': 'user', 'content': payload.transcript},
            ],
        )
        content = response.choices[0].message.content or '{}'
        result = json.loads(content)
        fields = result.get('fields') or {}
        validation = result.get('validation') or {}

        # Deterministic safety net for common jewellery terms so explicit spoken
        # stone mentions are not lost if the LLM under-extracts them.
        transcript_lower = payload.transcript.lower()
        stone_terms = [
            ('diamond', 'Diamond'), ('ruby', 'Ruby'), ('emerald', 'Emerald'),
            ('sapphire', 'Sapphire'), ('kundan', 'Kundan'), ('polki', 'Polki'),
            ('pearl', 'Pearl'), ('cubic zirconia', 'Cubic Zirconia'),
        ]
        if not fields.get('stones'):
            for term, label in stone_terms:
                if term in transcript_lower:
                    fields['stones'] = label
                    break

        design_terms = []
        if fields.get('item'):
            item_label = str(fields['item']).strip()
            if item_label and item_label.lower() not in ('none', 'null'):
                design_terms.append(item_label)
        if fields.get('stones') and str(fields['stones']).strip().lower() not in ('none', 'null'):
            stone_label = str(fields['stones']).strip()
            if stone_label.lower() not in {x.lower() for x in design_terms}:
                design_terms.append(stone_label)
        for phrase in ('sleek', 'thin', 'very thin', 'thick', 'minimal', 'classic', 'modern', 'vintage', 'delicate', 'bold', 'plain', 'openwork', 'filigree', 'solitaire', 'halo', 'bezel', 'prong', 'engraved', 'engraving', 'matte', 'polished', 'textured'):
            if phrase in transcript_lower and phrase.lower() not in {x.lower() for x in design_terms}:
                design_terms.append(phrase)
        existing_notes = str(fields.get('notes') or '').strip()
        if existing_notes:
            existing_lower = existing_notes.lower()
            prefix = [term for term in design_terms if term.lower() not in existing_lower]
            if prefix:
                fields['notes'] = '; '.join(prefix + [existing_notes])
        elif design_terms:
            fields['notes'] = '; '.join(design_terms)
        required = ['customer_name', 'item', 'material', 'weight', 'due_date']
        missing = validation.get('missing_fields') or [key for key in required if fields.get(key) in (None, '')]
        validation['missing_fields'] = missing
        validation['needs_review'] = bool(validation.get('needs_review') or missing)
        return {'transcript': payload.transcript, 'fields': fields, 'validation': validation}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'AI extraction failed: {exc}')



class PinterestSearchRequest(BaseModel):
    query: str
    bookmark: str | None = None
    limit: int = 6


@router.post('/pinterest-search')
def pinterest_search(payload: PinterestSearchRequest):
    """Search Pinterest partner Pins for design references.

    Pinterest exposes this endpoint as a beta feature and access is not enabled
    for every app. The access token stays server-side in backend/.env.
    """
    import json
    from urllib.parse import urlencode
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError, URLError

    query = ' '.join((payload.query or '').split()).strip()
    if not query:
        raise HTTPException(status_code=400, detail='Pinterest search query cannot be empty.')
    if not PINTEREST_ACCESS_TOKEN:
        raise HTTPException(
            status_code=503,
            detail='Pinterest API access is not configured yet. Add PINTEREST_ACCESS_TOKEN to backend/.env after Pinterest approves the app.'
        )

    limit = max(1, min(int(payload.limit or 6), 10))
    params = {
        'term': query,
        'country_code': PINTEREST_COUNTRY_CODE,
        'locale': PINTEREST_LOCALE,
        'limit': limit,
    }
    if payload.bookmark:
        params['bookmark'] = payload.bookmark

    try:
        query_string = urlencode(params)
        request = Request(
            f'https://api.pinterest.com/v5/search/partner/pins?{query_string}',
            headers={
                'Authorization': f'Bearer {PINTEREST_ACCESS_TOKEN}',
                'Accept': 'application/json',
            },
            method='GET',
        )
        with urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode('utf-8'))

        items = []
        for pin in data.get('items', []):
            media = pin.get('media') or {}
            images = media.get('images') or {}
            image = images.get('600x') or images.get('1200x') or images.get('400x300') or images.get('150x150') or {}
            image_url = image.get('url') if isinstance(image, dict) else None
            if not image_url:
                continue
            items.append({
                'id': str(pin.get('id') or ''),
                'title': pin.get('title') or '',
                'description': pin.get('description') or '',
                'alt_text': pin.get('alt_text') or '',
                'image_url': image_url,
                'pin_url': pin.get('link') or '',
            })

        return {
            'query': query,
            'items': items[:6],
            'bookmark': data.get('bookmark'),
        }
    except HTTPException:
        raise
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise HTTPException(
                status_code=502,
                detail='Pinterest rejected the API request. The app may still be pending approval or the beta Partner Pins search may not be enabled for this app.'
            )
        if exc.code == 429:
            raise HTTPException(status_code=429, detail='Pinterest search rate limit reached. Please try again shortly.')
        raise HTTPException(status_code=502, detail=f'Pinterest search failed with HTTP {exc.code}.')
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f'Pinterest search failed: {exc.reason}')
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Pinterest response could not be processed: {exc}')



class DesignReferenceSearchRequest(BaseModel):
    query: str
    limit: int = 6
    item_type: str | None = None
    excluded_ids: list[str] = []




@router.get('/pinterest-preview')
def pinterest_preview(url: str = Query(..., min_length=1)):
    """Resolve the preview image for a Pinterest Pin URL for internal dashboards."""
    return _resolve_pinterest_preview(url.strip())

@router.post('/design-references/search')
def search_design_references(payload: DesignReferenceSearchRequest):
    """Retrieve the six closest jewellery references from WorkLoom's local vector library."""
    try:
        from app.design_retrieval import search_references
        query = ' '.join((payload.query or '').split()).strip()
        if not query:
            raise HTTPException(status_code=400, detail='Design search query cannot be empty.')
        return {'query': query, 'items': search_references(query, payload.limit, payload.item_type, payload.excluded_ids)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))

@router.post('/design-concepts')
def design_concepts(payload: DesignConceptRequest):
    """Create structured visual design briefs from the current jewellery job."""
    try:
        client = _get_client()
        import json
        brief = {
            'item': payload.item, 'material': payload.material, 'weight': payload.weight,
            'stones': payload.stones, 'notes': payload.notes, 'customer_brief': payload.customer_brief,
        }
        response = client.chat.completions.create(
            model='openai/gpt-oss-20b', temperature=0.4, response_format={'type': 'json_object'},
            messages=[
                {'role': 'system', 'content': (
                    'Create exactly 5 distinct jewellery design concepts from the brief. Return JSON only with key concepts, an array of 5 objects. '
                    'Each object must have title, concept, visual_prompt, practical_notes. The visual_prompt must be a detailed image-generation prompt matching the exact item, weight, metal/purity, stone work, and design notes. '
                    'These are visual concept references, not manufacturing CAD. Do not promise exact weight or manufacturability.'
                )},
                {'role': 'user', 'content': json.dumps(brief)},
            ],
        )
        data = json.loads(response.choices[0].message.content or '{}')
        concepts = data.get('concepts') or []
        return {
            'concepts': concepts[:5],
            'disclaimer': 'AI concepts are visual references. Owner approval and production judgement are required before manufacturing.',
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Design concept generation failed: {exc}')
