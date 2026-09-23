"""WorkLoom semantic jewellery-reference retrieval using a pretrained CLIP model + FAISS."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import numpy as np

BASE_DIR = Path(__file__).resolve().parents[1]
LIBRARY_DIR = Path(os.getenv("WORKLOOM_REFERENCE_LIBRARY", BASE_DIR / "reference_library"))
IMAGE_DIR = LIBRARY_DIR / "images"
INDEX_PATH = LIBRARY_DIR / "faiss.index"
META_PATH = LIBRARY_DIR / "metadata.json"
MODEL_ID = os.getenv(
    "WORKLOOM_CLIP_MODEL",
    str(BASE_DIR / "reference_library" / "clip_model"),
)

_model = None
_processor = None
_index = None
_metadata: list[dict[str, Any]] = []


def _load_model():
    global _model, _processor
    if _model is not None:
        return _model, _processor
    try:
        import torch
        from transformers import AutoProcessor, CLIPModel
    except ImportError as exc:
        raise RuntimeError("Install the AI retrieval dependencies from backend/requirements.txt first.") from exc

    _processor = AutoProcessor.from_pretrained(MODEL_ID)
    _model = CLIPModel.from_pretrained(MODEL_ID)
    _model.eval()
    return _model, _processor


def _load_index():
    global _index, _metadata
    if _index is not None:
        return _index, _metadata
    if not INDEX_PATH.exists() or not META_PATH.exists():
        raise RuntimeError(
            "Reference library is not indexed yet. Run `python setup_reference_library.py` from the backend folder."
        )
    try:
        import faiss
    except ImportError as exc:
        raise RuntimeError("FAISS is not installed. Run `pip install -r requirements.txt` in backend.") from exc
    _index = faiss.read_index(str(INDEX_PATH))
    _metadata = json.loads(META_PATH.read_text(encoding="utf-8"))
    return _index, _metadata


def _normalize_item_type(item_type: str | None) -> str | None:
    value = ' '.join((item_type or '').lower().split()).strip()
    if not value:
        return None
    aliases = {
        'ring': 'ring', 'rings': 'ring',
        'bracelet': 'bracelet', 'bracelets': 'bracelet',
        'bangle': 'bracelet', 'bangles': 'bracelet',
        'necklace': 'necklace', 'necklaces': 'necklace',
        'earring': 'earring', 'earrings': 'earring',
        'stud': 'earring', 'studs': 'earring',
        'hoop': 'earring', 'hoops': 'earring',
    }
    return aliases.get(value)


def _detect_item_type_from_query(query: str) -> str | None:
    """Prefer an explicit jewellery type in the user's search text over the order default."""
    q = f" {query.lower()} "
    patterns = [
        (r'\b(?:bangles?|bracelets?)\b', 'bracelet'),
        (r'\b(?:earrings?|studs?|hoops?)\b', 'earring'),
        (r'\b(?:necklaces?)\b', 'necklace'),
        (r'\b(?:rings?)\b', 'ring'),
    ]
    import re
    for pattern, category in patterns:
        if re.search(pattern, q):
            return category
    return None


def _category_matches(metadata_item: dict[str, Any], item_type: str | None) -> bool:
    if not item_type:
        return True
    category = str(metadata_item.get('category') or '').strip().lower()
    return category == item_type


def _attribute_queries(query: str, category: str | None) -> list[tuple[str, float]]:
    """Create a few focused CLIP text prompts for common jewellery attributes.

    The dataset has no reliable stud/hoop/traditional/slim/diamond labels, so these
    prompts improve ranking without pretending those attributes are ground-truth labels.
    """
    import re
    q = query.lower()
    prompts: list[tuple[str, float]] = [(query, 1.0)]
    cat_name = {
        'ring': 'ring', 'earring': 'earring', 'bracelet': 'bracelet', 'necklace': 'necklace'
    }.get(category or '')
    if not cat_name:
        return prompts

    terms = []
    if re.search(r'\b(?:stud|studs)\b', q): terms.append('small stud earring')
    if re.search(r'\b(?:hoop|hoops)\b', q): terms.append('hoop earring')
    if re.search(r'\b(?:traditional|classic|ethnic|indian)\b', q): terms.append(f'traditional {cat_name}')
    if re.search(r'\b(?:sleek|slim|thin|minimal|minimalist|delicate)\b', q): terms.append(f'sleek slim thin {cat_name}')
    if re.search(r'\b(?:diamond|diamonds|solitaire)\b', q): terms.append(f'diamond {cat_name}')
    if re.search(r'\b(?:simple|plain)\b', q): terms.append(f'simple minimal {cat_name}')
    if re.search(r'\b(?:modern|contemporary)\b', q): terms.append(f'modern {cat_name}')
    for prompt in terms:
        prompts.append((prompt, 0.55))
    return prompts


def search_references(
    query: str,
    limit: int = 6,
    item_type: str | None = None,
    excluded_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    query = ' '.join((query or '').split()).strip()
    if not query:
        return []
    index, metadata = _load_index()
    model, processor = _load_model()
    import torch

    # An explicit type in the search box wins over the order's default item.
    requested_category = _detect_item_type_from_query(query) or _normalize_item_type(item_type)
    excluded = {str(x) for x in (excluded_ids or [])}
    prompts = _attribute_queries(query, requested_category)

    # Aggregate several CLIP text-query rankings. The original query has the highest
    # weight; focused prompts gently boost common jewellery attributes.
    aggregate: dict[int, float] = {}
    for prompt, weight in prompts:
        inputs = processor(text=[prompt], return_tensors='pt', padding=True)
        with torch.inference_mode():
            text_outputs = model.text_model(**inputs)
            pooled = text_outputs.pooler_output
            features = model.text_projection(pooled)
            features = features / features.norm(dim=-1, keepdim=True)
        vector = features.cpu().numpy().astype('float32')
        scores, ids = index.search(vector, index.ntotal)
        for score, idx in zip(scores[0], ids[0]):
            if idx < 0 or idx >= len(metadata):
                continue
            item = metadata[idx]
            if not _category_matches(item, requested_category):
                continue
            if str(item.get('id')) in excluded:
                continue
            # Keep the best evidence for each image rather than rewarding an image
            # for appearing in many unrelated prompt rankings.
            weighted = float(score) * weight
            aggregate[idx] = max(aggregate.get(idx, -999.0), weighted)

    ranked = sorted(aggregate.items(), key=lambda pair: pair[1], reverse=True)
    results = []
    for idx, score in ranked[:max(limit, 1)]:
        item = dict(metadata[idx])
        item['score'] = round(float(score), 4)
        item['matched_category'] = requested_category
        results.append(item)
    return results

