import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { itemTypes, metalTypes, stoneOptions } from '../constants';
import { fetchTeam } from '../services/teamApi.js';
import { createOrder } from '../services/ordersApi.js';
import { transcribeVoice, extractOrderFields } from '../services/voiceApi.js';
import { uploadDesignImage } from '../services/uploadsApi.js';
import { recommendKarigar } from '../services/recommendationApi.js';
import { apiRequest, API_BASE_URL } from '../services/api.js';

const emptyForm = {
  customer: '',
  phone: '',
  item: itemTypes[0],
  metal: metalTypes[1],
  weight: '',
  stones: stoneOptions[0],
  karigarId: '',
  priority: 'Medium',
  dueDate: '',
  advance: '',
  estimateValue: '',
  notes: '',
  designImageUrl: '',
  designReferenceUrl: '',
  designReferenceUrls: [],
  designSource: '',
  aiReviewed: false,
  aiMissingFields: [],
  aiConfidence: {},
  designConcept: null,
};

const CREATE_ORDER_DRAFT_KEY = 'workloom_create_order_draft_v3';

export default function CreateOrder({ user, onLogout }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CREATE_ORDER_DRAFT_KEY) || 'null');
      if (saved?.form) return { ...emptyForm, ...saved.form, designReferenceUrls: saved.form.designReferenceUrls || [] };
    } catch {
      // Ignore invalid/stale draft data.
    }
    return { ...emptyForm };
  });
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [transcript, setTranscript] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CREATE_ORDER_DRAFT_KEY) || 'null');
      return typeof saved?.transcript === 'string' ? saved.transcript : '';
    } catch {
      return '';
    }
  });
  const [voiceError, setVoiceError] = useState('');
  const [aiValidation, setAiValidation] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [recommendBusy, setRecommendBusy] = useState(false);
  const [team, setTeam] = useState([]);
  const [teamBusy, setTeamBusy] = useState(true);
  const [fieldStatus, setFieldStatus] = useState({});
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [designStudioOpen, setDesignStudioOpen] = useState(false);
  const [designMode, setDesignMode] = useState('draw');
  const [pinterestQuery, setPinterestQuery] = useState('');
  const [pinterestItems, setPinterestItems] = useState([]);
  const [pinterestBookmark, setPinterestBookmark] = useState(null);
  const [pinterestAttachedRefs, setPinterestAttachedRefs] = useState([]);
  const [pinterestPinInput, setPinterestPinInput] = useState('');
  const [pinterestBusy, setPinterestBusy] = useState(false);
  const [pinterestError, setPinterestError] = useState('');
  const [referenceItems, setReferenceItems] = useState([]);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const [referenceHistory, setReferenceHistory] = useState([]);
  const referenceSeenIdsRef = useRef(new Set());
  const [brushSize, setBrushSize] = useState(4);
  const [drawTool, setDrawTool] = useState('pencil');
  const [cameraOn, setCameraOn] = useState(false);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(CREATE_ORDER_DRAFT_KEY, JSON.stringify({
        form,
        transcript,
      }));
    } catch {
      // Draft persistence is best-effort.
    }
  }, [form, transcript]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (pinterestAttachedRefs.length === 0) return;

    const runBuild = () => {
      try {
        window.PinUtils?.build();
      } catch {
        // Pinterest embed rendering is best-effort; the source link remains available.
      }
    };

    const existing = document.querySelector('script[data-workloom-pinterest]');
    if (existing) {
      if (window.PinUtils?.build) runBuild();
      else existing.addEventListener('load', runBuild, { once: true });
      return undefined;
    }

    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = 'https://assets.pinterest.com/js/pinit.js';
    script.setAttribute('data-workloom-pinterest', 'true');
    script.addEventListener('load', runBuild, { once: true });
    document.body.appendChild(script);
    return undefined;
  }, [pinterestAttachedRefs]);

  useEffect(() => {
    let active = true;
    fetchTeam()
      .then((members) => {
        if (!active) return;
        const normalized = (members || []).map((member) => ({
          id: member.user_id,
          name: member.name,
          specialty: member.specialty || 'General jewellery work',
          activeOrders: 0,
          onTimeRate: null,
        }));
        setTeam(normalized);
        setForm((current) => ({ ...current, karigarId: current.karigarId || normalized[0]?.id || '' }));
      })
      .catch(() => { if (active) setTeam([]); })
      .finally(() => { if (active) setTeamBusy(false); });
    return () => { active = false; };
  }, []);

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOn(false);
  }

  function initCanvas(canvas) {
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 760;
    const height = canvas.clientHeight || 430;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#2D2922';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function openDesignStudio(mode) {
    const selectedMode = mode || 'pinterest';
    setDesignMode(selectedMode);
    setDesignStudioOpen(true);
    if (selectedMode === 'draw') {
      setTimeout(() => initCanvas(canvasRef.current), 0);
    }
  }

  function getCanvasPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDrawing(event) {
    if (designMode !== 'draw') return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const point = getCanvasPoint(event);
    drawingRef.current = true;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function draw(event) {
    if (!drawingRef.current || designMode !== 'draw') return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const point = getCanvasPoint(event);
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#2D2922';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function insertShape(shape) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = (canvas.width / ratio) || canvas.clientWidth || 760;
    const height = (canvas.height / ratio) || canvas.clientHeight || 430;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.strokeStyle = '#2D2922';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = width / 2, cy = height / 2;
    if (shape === 'circle') { ctx.beginPath(); ctx.arc(cx, cy, 95, 0, Math.PI * 2); ctx.stroke(); }
    if (shape === 'rectangle') { ctx.strokeRect(cx - 120, cy - 80, 240, 160); }
    if (shape === 'diamond') { ctx.beginPath(); ctx.moveTo(cx, cy - 110); ctx.lineTo(cx + 90, cy); ctx.lineTo(cx, cy + 110); ctx.lineTo(cx - 90, cy); ctx.closePath(); ctx.stroke(); }
    if (shape === 'ring') { ctx.beginPath(); ctx.arc(cx, cy, 90, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.stroke(); }
    if (shape === 'bangle') { ctx.beginPath(); ctx.ellipse(cx, cy, 145, 75, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(cx, cy, 108, 52, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (shape === 'pendant') { ctx.beginPath(); ctx.arc(cx, cy - 80, 24, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - 55); ctx.lineTo(cx + 75, cy + 55); ctx.lineTo(cx, cy + 130); ctx.lineTo(cx - 75, cy + 55); ctx.closePath(); ctx.stroke(); }
    if (shape === 'necklace') { ctx.beginPath(); ctx.arc(cx, cy - 15, 170, 0.2, Math.PI - 0.2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - 35, cy + 125); ctx.lineTo(cx, cy + 170); ctx.lineTo(cx + 35, cy + 125); ctx.stroke(); }
    ctx.restore();
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  async function saveDrawnDesign() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setImageBusy(true);
    setError('');
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not create the design image.');
      const file = new File([blob], `workloom-design-${Date.now()}.png`, { type: 'image/png' });
      const uploaded = await uploadDesignImage(file);
      update('designImageUrl', uploaded.url);
      update('designSource', 'hand_drawn');
      setDesignStudioOpen(false);
    } catch (err) {
      setError(err.message || 'Could not save the drawn design.');
    } finally {
      setImageBusy(false);
    }
  }

  async function startCamera() {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      cameraStreamRef.current = stream;
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 0);
    } catch (err) {
      setError(err.message || 'Camera permission is required.');
    }
  }

  async function captureCameraDesign() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    setImageBusy(true);
    setError('');
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Could not capture the camera image.');
      const file = new File([blob], `workloom-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const uploaded = await uploadDesignImage(file);
      update('designImageUrl', uploaded.url);
      update('designSource', 'existing');
      stopCamera();
      setDesignStudioOpen(false);
    } catch (err) {
      setError(err.message || 'Could not save the camera image.');
    } finally {
      setImageBusy(false);
    }
  }


  const requiredFieldLabels = {
    customer: 'customer name',
    item: 'item type',
    metal: 'material',
    weight: 'weight',
    dueDate: 'due date',
  };

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value, ...(field === 'aiReviewed' ? {} : {}) }));
    if (requiredFieldLabels[field]) {
      setFieldStatus((current) => ({ ...current, [field]: Boolean(String(value ?? '').trim()) }));
      setForm((f) => ({ ...f, [field]: value, aiReviewed: false }));
    }
  }

  function finalMissingFields(nextForm = form) {
    return Object.entries(requiredFieldLabels)
      .filter(([field]) => !String(nextForm[field] ?? '').trim())
      .map(([, label]) => label);
  }

  function finalMissingKeys(nextForm = form) {
    return Object.entries(requiredFieldLabels)
      .filter(([field]) => !String(nextForm[field] ?? '').trim())
      .map(([field]) => field);
  }

  function labelForField(field) {
    return requiredFieldLabels[field] || field.replaceAll('_', ' ');
  }


  async function handleVoice() {
    setVoiceError('');
    if (recording) {
      mediaRecorder?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError('Voice recording is not supported by this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ];
      const supportedType = preferredTypes.find(
        (type) => MediaRecorder.isTypeSupported?.(type)
      );

      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);

      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setVoiceBusy(true);
        try {
          if (!chunks.length) {
            throw new Error('No audio was captured. Please try recording again.');
          }

          const blob = new Blob(chunks, {
            type: recorder.mimeType || 'audio/webm',
          });
          const result = await transcribeVoice(blob);
          const text = typeof result?.transcript === 'string' ? result.transcript : '';

          if (!text.trim()) {
            throw new Error('No speech was detected. Please record again.');
          }

          setTranscript(text.trim());
        } catch (err) {
          setVoiceError(err.message || 'Could not transcribe the recording.');
        } finally {
          setVoiceBusy(false);
          setMediaRecorder(null);
        }
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch (err) {
      setVoiceError(err.message || 'Microphone permission is required.');
    }
  }

  async function extractFromTranscript() {
    if (!transcript.trim()) return;
    setVoiceError('');
    setVoiceBusy(true);
    try {
      const result = await extractOrderFields(transcript.trim());
      const fields = result.fields || {};
      const validation = result.validation || {};
      const normalizedMaterial = normalizeMaterial(fields.material);
      const normalizedStone = normalizeStone(fields.stones);
      const matchedKarigar = team.find((k) => k.name.toLowerCase() === String(fields.karigar || '').toLowerCase());
      const nextForm = {
        ...form,
        customer: fields.customer_name ?? form.customer,
        item: itemTypes.includes(fields.item) ? fields.item : form.item,
        metal: normalizedMaterial || form.metal,
        weight: fields.weight != null ? String(fields.weight).replace(/[^0-9.]/g, '') : form.weight,
        stones: normalizedStone || form.stones,
        karigarId: matchedKarigar?.id || form.karigarId,
        priority: ['High','Medium','Low'].includes(fields.priority) ? fields.priority : form.priority,
        dueDate: fields.due_date || form.dueDate,
        advance: fields.advance != null ? String(fields.advance) : form.advance,
        estimateValue: fields.estimate_value != null ? String(fields.estimate_value) : form.estimateValue,
        notes: fields.notes ?? form.notes,
        aiReviewed: false,
        aiMissingFields: validation.missing_fields || [],
        aiConfidence: validation.confidence || {},
      };
      const nextStatus = Object.fromEntries(
        Object.keys(requiredFieldLabels).map((key) => [
          key,
          Boolean(String(nextForm[key] ?? '').trim()),
        ])
      );
      setForm(nextForm);
      setFieldStatus(nextStatus);
      const aiMissing = (validation.missing_fields || []).map((field) => {
        const aliases = { customer_name: 'customer', material: 'metal', due_date: 'dueDate' };
        return aliases[field] || field;
      });
      setAiValidation({
        ...validation,
        original_missing_fields: aiMissing,
        needs_review: true,
      });
    } catch (err) {
      setVoiceError(err.message || 'Could not extract order details.');
    } finally {
      setVoiceBusy(false);
    }
  }

  function normalizeMaterial(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return '';
    return metalTypes.find((m) => m.toLowerCase() === text)
      || metalTypes.find((m) => text.includes(m.toLowerCase()))
      || (text.includes('gold 24') ? 'Gold 24K' : text.includes('gold 22') ? 'Gold 22K' : text.includes('gold 18') ? 'Gold 18K' : '');
  }

  function normalizeStone(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return '';
    return stoneOptions.find((stone) => stone.toLowerCase() === text)
      || stoneOptions.find((stone) => stone !== 'None' && text.includes(stone.toLowerCase()))
      || '';
  }

  function buildPinterestQuery() {
    const rawBrief = [form.notes, transcript].filter(Boolean).join('. ');
    const parts = [
      form.item,
      form.metal,
      form.stones && form.stones !== stoneOptions[0] ? form.stones : '',
      form.weight ? `${form.weight} gram` : '',
      rawBrief,
    ].filter(Boolean);
    return `${parts.join(' ')} jewellery design reference`
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pinterestSearchUrl(query) {
    return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
  }

  function openPinterestFallback(query) {
    if (!query) return;
    try {
      sessionStorage.setItem(CREATE_ORDER_DRAFT_KEY, JSON.stringify({ form, transcript }));
    } catch {
      // Ignore storage failures; opening in a new tab still avoids losing the form.
    }
    const opened = window.open(pinterestSearchUrl(query), '_blank', 'noopener,noreferrer');
    if (!opened) {
      setPinterestError('Pinterest was blocked by the browser. Please allow pop-ups for WorkLoom.');
    }
  }

  async function searchWorkloomReferences(queryOverride = '', { refresh = false } = {}) {
    const query = (queryOverride || pinterestQuery || buildPinterestQuery()).trim();
    if (!query) return;
    if (!refresh) {
      referenceSeenIdsRef.current = new Set();
      setReferenceHistory([]);
    } else if (referenceItems.length) {
      setReferenceHistory((history) => [...history, { items: referenceItems, query }]);
    }
    const excludedIds = refresh ? Array.from(referenceSeenIdsRef.current) : [];
    setReferenceBusy(true);
    setReferenceError('');
    try {
      const result = await apiRequest('/voice/design-references/search', {
        method: 'POST',
        body: JSON.stringify({ query, limit: 6, item_type: form.item || null, excluded_ids: excludedIds }),
      });
      const items = Array.isArray(result.items) ? result.items : [];
      setReferenceItems(items);
      items.forEach((item) => { if (item?.id) referenceSeenIdsRef.current.add(item.id); });
      if (!items.length) {
        if (refresh) {
          setReferenceHistory((history) => history.slice(0, -1));
          setReferenceError('No more unseen references were found for this brief.');
        } else {
          setReferenceError('No close references were found. Try a broader design description.');
        }
      }
    } catch (err) {
      if (refresh) setReferenceHistory((history) => history.slice(0, -1));
      setReferenceItems([]);
      setReferenceError(err.message || 'Reference library is not ready yet.');
    } finally {
      setReferenceBusy(false);
    }
  }

  function goBackReferenceResults() {
    setReferenceHistory((history) => {
      if (!history.length) return history;
      const previous = history[history.length - 1];
      setReferenceItems(previous.items || []);
      setPinterestQuery(previous.query || pinterestQuery);
      setReferenceError('');
      return history.slice(0, -1);
    });
  }

  function openAiReferenceMode() {
    const query = buildPinterestQuery();
    setPinterestQuery(query);
    setReferenceItems([]);
    setReferenceHistory([]);
    referenceSeenIdsRef.current = new Set();
    setReferenceError('');
    setDesignMode('ai-reference');
    setDesignStudioOpen(true);
    searchWorkloomReferences(query);
  }

  async function searchPinterest({ nextPage = false, queryOverride = '', fallbackToPinterest = true } = {}) {
    const query = queryOverride || pinterestQuery || buildPinterestQuery();
    if (!query) return;
    setPinterestQuery(query);
    setPinterestBusy(true);
    setPinterestError('');
    try {
      const result = await apiRequest('/voice/pinterest-search', {
        method: 'POST',
        body: JSON.stringify({ query, bookmark: nextPage ? pinterestBookmark : null, limit: 6 }),
      });
      const items = Array.isArray(result.items) ? result.items : [];
      if (!items.length) {
        if (fallbackToPinterest) { openPinterestFallback(query); return; }
        setPinterestItems([]);
        setPinterestError('Pinterest did not return matching references for this brief. Try a broader design description.');
        return;
      }
      setPinterestItems(items);
      setPinterestBookmark(result.bookmark || null);
    } catch (err) {
      setPinterestItems([]);
      if (fallbackToPinterest) { openPinterestFallback(query); return; }
      setPinterestError(err.message || 'Could not search Pinterest references.');
    } finally {
      setPinterestBusy(false);
    }
  }

  function openPinterestMode() {
    const query = buildPinterestQuery();
    setPinterestQuery(query);
    setPinterestItems([]);
    setPinterestBookmark(null);
    setPinterestError('');
    setReferenceItems([]);
    setReferenceError('');
    openDesignStudio('pinterest');
    searchPinterest({ queryOverride: query });
  }

  async function getRecommendation() {
    setRecommendBusy(true);
    try {
      const result = await recommendKarigar({ item: form.item, stones: form.stones });
      setRecommendation(result);
      const best = result.recommended?.name;
      const matched = team.find((k) => k.name === best);
      if (matched) update('karigarId', matched.id);
    } catch (err) {
      setError(err.message || 'Could not recommend a karigar.');
    } finally { setRecommendBusy(false); }
  }

  async function handleDesignImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Design image must be 5 MB or smaller.');
      return;
    }
    setImageBusy(true);
    try {
      const uploaded = await uploadDesignImage(file);
      update('designImageUrl', uploaded.url);
    } catch (err) {
      setError(err.message || 'Could not upload the design image.');
    } finally {
      setImageBusy(false);
      event.target.value = '';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const missing = finalMissingFields();
    if (aiValidation && missing.length > 0) {
      setError(`Please complete: ${missing.join(', ')}.`);
      return;
    }
    if (aiValidation?.needs_review && !form.aiReviewed) {
      setError('Please review the AI-extracted fields and approve them before creating this order.');
      return;
    }
    setSaving(true);

    const selectedKarigar = team.find((k) => k.id === form.karigarId);

    try {
      const created = await createOrder({
        customer_name: form.customer.trim(),
        phone: form.phone.trim(),
        item: form.item,
        material: form.metal,
        weight: form.weight,
        stones: form.stones,
        karigar: selectedKarigar?.name || form.karigarId,
        karigar_user_id: selectedKarigar?.id || form.karigarId,
        priority: form.priority,
        due_date: form.dueDate,
        advance: form.advance === '' ? null : Number(form.advance),
        estimate_value: form.estimateValue === '' ? null : Number(form.estimateValue),
        notes: form.notes.trim() || null,
        design_image_url: form.designImageUrl || null,
        design_reference_url: form.designReferenceUrl || null,
        design_reference_urls: pinterestAttachedRefs.length ? pinterestAttachedRefs : null,
        design_source: form.designSource || null,
        ai_reviewed: form.aiReviewed,
        ai_missing_fields: form.aiMissingFields,
        ai_confidence: form.aiConfidence,
        design_concept: form.designConcept,
        stage: 'Design Approved',
      });
      setSubmitted({ ...form, id: created.order_id });
    } catch (err) {
      setError(err.message || 'Could not create the order.');
    } finally {
      setSaving(false);
    }
  }

  function attachPinterestReference(url) {
    const value = String(url || '').trim();
    if (!value) return false;
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (host !== 'pinterest.com' && !host.endsWith('.pinterest.com')) throw new Error('Please paste a valid Pinterest Pin link.');
    } catch {
      setPinterestError('Please paste a valid Pinterest Pin link.');
      return false;
    }
    if (pinterestAttachedRefs.includes(value)) {
      setPinterestError('This Pinterest reference is already selected.');
      return false;
    }
    if (pinterestAttachedRefs.length >= 4) {
      setPinterestError('You can attach up to 4 Pinterest references to one order.');
      return false;
    }
    const next = [...pinterestAttachedRefs, value];
    setPinterestAttachedRefs(next);
    setForm((current) => ({
      ...current,
      designReferenceUrl: current.designReferenceUrl || value,
      designReferenceUrls: next,
      designSource: 'pinterest',
    }));
    setPinterestError('');
    return true;
  }

  function removePinterestReference(url) {
    const next = pinterestAttachedRefs.filter((ref) => ref !== url);
    setPinterestAttachedRefs(next);
    setForm((current) => ({
      ...current,
      designReferenceUrl: next[0] || '',
      designReferenceUrls: next,
      designSource: next.length ? 'pinterest' : '',
    }));
  }

  function startAnother() {
    try { sessionStorage.removeItem(CREATE_ORDER_DRAFT_KEY); } catch { /* ignore */ }
    setForm({ ...emptyForm });
    setSubmitted(null);
    setError('');
    setAiValidation(null);
    setTranscript('');
    setFieldStatus({});
    setRecommendation(null);
    setDesignMode('ai');
    setPinterestQuery('');
    setPinterestItems([]);
    setPinterestBookmark(null);
    setPinterestAttachedRefs([]);
    setPinterestPinInput('');
    setPinterestBusy(false);
    setPinterestError('');
    stopCamera();
  }

  const selectedKarigar = team.find((k) => k.id === form.karigarId);
  const calculatedBalance = Math.max(0, (Number(form.estimateValue) || 0) - (Number(form.advance) || 0));

  if (submitted) {
    return (
      <DashboardLayout role="owner" user={user} onLogout={onLogout} title="Create order" subtitle="Book a new jewellery order">
        <div className="wl-card p-5 text-center mx-auto" style={{ maxWidth: 520 }}>
          <div className="wl-avatar mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.4rem', background: 'var(--wl-emerald-soft)', borderColor: 'var(--wl-emerald)', color: 'var(--wl-emerald)' }}><i className="bi bi-check2" /></div>
          <h2 className="font-display h4 mb-2">Order {submitted.id} created</h2>
          <p className="text-secondary mb-4">{submitted.customer || 'The customer'}'s {submitted.item.toLowerCase()} has been saved to MongoDB and assigned to {selectedKarigar?.name}. It starts at the Design Approved stage.</p>
          <div className="d-flex gap-2 justify-content-center">
            <button className="btn btn-wl-outline border" onClick={startAnother}>Create another order</button>
            <button className="btn btn-wl-gold" onClick={() => navigate('/owner')}>Go to dashboard</button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="owner" user={user} onLogout={onLogout} title="Create order" subtitle="Book a new jewellery order">
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="row g-3">
          <div className="col-lg-8">
            <div className="wl-card p-3 p-md-4 mb-3">
              <h2 className="wl-section-title h6 mb-3">Customer details</h2>
              <div className="row g-3">
                <div className="col-md-7"><label className="wl-form-label" htmlFor="customer">Customer name</label><input id="customer" className="form-control" placeholder="e.g. Meena Kapoor" value={form.customer} onChange={(e) => update('customer', e.target.value)} required /></div>
                <div className="col-md-5"><label className="wl-form-label" htmlFor="phone">Phone number</label><input id="phone" className="form-control" placeholder="+91 98XXX XXXXX" value={form.phone} onChange={(e) => update('phone', e.target.value)} required /></div>
              </div>
            </div>

            <div className="wl-card p-3 p-md-4 mb-3">
              <div className="d-flex justify-content-between align-items-center gap-3">
                <div>
                  <h2 className="wl-section-title h6 mb-1">AI voice order</h2>
                  <div className="small text-secondary">Speak naturally; WorkLoom transcribes and extracts the job details.</div>
                </div>
                <button type="button" className={"btn " + (recording ? "btn-danger" : "btn-wl-gold")} onClick={handleVoice} disabled={voiceBusy}>
                  <i className={"bi " + (recording ? "bi-stop-fill" : "bi-mic-fill") + " me-1"} />
                  {recording ? 'Stop recording' : 'Record voice'}
                </button>
              </div>
              {voiceBusy && <div className="small text-secondary mt-3">Processing voice…</div>}
              {voiceError && <div className="alert alert-warning mt-3 mb-0 py-2">{voiceError}</div>}
              {transcript && (
                <div className="mt-3">
                  <label className="wl-form-label" htmlFor="voiceTranscript">Transcript</label>
                  <textarea id="voiceTranscript" className="form-control" rows={3} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
                  <button type="button" className="btn btn-outline-dark btn-sm mt-2" onClick={extractFromTranscript} disabled={voiceBusy}>
                    <i className="bi bi-stars me-1" /> Extract order details with AI
                  </button>
                </div>
              )}
            </div>

            <div className="wl-card p-3 p-md-4 mb-3">
              <h2 className="wl-section-title h6 mb-3">Item specification</h2>
              <div className="row g-3">
                <div className="col-md-6"><label className="wl-form-label" htmlFor="item">Item type</label><select id="item" className="form-select" value={form.item} onChange={(e) => update('item', e.target.value)}>{itemTypes.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div className="col-md-6"><label className="wl-form-label" htmlFor="metal">Metal &amp; purity</label><select id="metal" className="form-select" value={form.metal} onChange={(e) => update('metal', e.target.value)}>{metalTypes.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div className="col-md-6"><label className="wl-form-label" htmlFor="weight">Approx. weight (grams)</label><input id="weight" type="number" step="0.1" min="0" className="form-control" placeholder="e.g. 12.5" value={form.weight} onChange={(e) => update('weight', e.target.value)} required /></div>
                <div className="col-md-6"><label className="wl-form-label" htmlFor="stones">Stone work</label><select id="stones" className="form-select" value={form.stones} onChange={(e) => update('stones', e.target.value)}>{stoneOptions.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div className="col-12"><label className="wl-form-label" htmlFor="notes">Design notes for the karigar</label><textarea id="notes" className="form-control" rows={3} placeholder="Finish, reference design, engraving text, resizing instructions…" value={form.notes} onChange={(e) => update('notes', e.target.value)} /></div>
              </div>
            </div>

            <div className="wl-card p-3 p-md-4 mb-3">
              <div className="mb-3">
                <h2 className="wl-section-title h6 mb-1">Design studio</h2>
                <div className="small text-secondary">Choose the final design reference for the karigar — find inspiration on Pinterest, draw your own, capture it, or upload one.</div>
              </div>
              <div className="d-flex flex-wrap gap-2 mb-3">
                <button type="button" className="btn btn-sm btn-wl-gold" onClick={openAiReferenceMode} disabled={imageBusy}><i className="bi bi-stars me-1" /> WorkLoom AI</button>
                <button type="button" className="btn btn-sm btn-wl-outline border" onClick={openPinterestMode} disabled={imageBusy}><i className="bi bi-pinterest me-1" /> Pinterest</button>
                <button type="button" className="btn btn-sm btn-wl-outline border" onClick={() => openDesignStudio('draw')} disabled={imageBusy}><i className="bi bi-pencil me-1" /> Draw design</button>
                <button type="button" className="btn btn-sm btn-wl-outline border" onClick={() => openDesignStudio('camera')} disabled={imageBusy}><i className="bi bi-camera me-1" /> Use camera</button>
                <label className="btn btn-sm btn-wl-outline border mb-0">
                  <i className="bi bi-upload me-1" /> Upload reference
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="d-none" onChange={(e) => { update('designSource','reference'); handleDesignImage(e); }} disabled={imageBusy} />
                </label>
              </div>
              {form.designImageUrl ? (
                <div className="position-relative mt-3">
                  <img src={form.designImageUrl} alt="Saved jewellery design reference" className="img-fluid rounded border" style={{ maxHeight: 280, width: '100%', objectFit: 'contain', background: 'var(--wl-surface)' }} />
                  <button type="button" className="btn btn-sm btn-light border position-absolute top-0 end-0 m-2" onClick={() => update('designImageUrl', '')}>Remove</button>
                </div>
              ) : pinterestAttachedRefs.length > 0 && form.designSource === 'pinterest' ? (
                <div className="border rounded-3 p-3 mt-3" style={{ background: 'var(--wl-surface)' }}>
                  <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
                    <div className="fw-semibold small">Pinterest design references</div>
                    <div className="small text-secondary">{pinterestAttachedRefs.length} selected</div>
                  </div>
                  <div className="row g-3">
                    {pinterestAttachedRefs.map((url, index) => (
                      <div className="col-12 col-md-6" key={url}>
                        <div className="border rounded-3 p-2 bg-white h-100">
                          <div className="small fw-semibold mb-2">Design {index + 1}</div>
                          <div className="overflow-hidden"><a data-pin-do="embedPin" href={url} aria-label={`Pinterest design reference ${index + 1}`}>{url}</a></div>
                          <button type="button" className="btn btn-sm btn-light border mt-2" onClick={() => removePinterestReference(url)}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="small text-secondary mt-2">Source: Pinterest</div>
                </div>
              ) : (
                <div className="border rounded p-4 text-center text-secondary small">
                  <i className="bi bi-images fs-3 d-block mb-2" />
                  No design reference selected yet.
                </div>
              )}
            </div>

            {designStudioOpen && (
              <div className="wl-design-modal" role="dialog" aria-modal="true" aria-label="WorkLoom design studio">
                <div className="wl-design-modal-card">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <h2 className="font-display h5 mb-1">Design studio</h2>
                      <div className="small text-secondary">Make a quick custom reference for the karigar.</div>
                    </div>
                    <button type="button" className="btn btn-sm btn-light border" onClick={() => { stopCamera(); setDesignStudioOpen(false); }}><i className="bi bi-x-lg" /></button>
                  </div>

                  <div className="btn-group mb-3" role="group" aria-label="Design mode">
                    <button type="button" className={`btn ${designMode === 'ai-reference' ? 'btn-wl-gold' : 'btn-wl-outline border'}`} onClick={openAiReferenceMode}><i className="bi bi-stars me-1" /> WorkLoom AI</button>
                    <button type="button" className={`btn ${designMode === 'pinterest' ? 'btn-wl-gold' : 'btn-wl-outline border'}`} onClick={() => { stopCamera(); const q = buildPinterestQuery(); setPinterestQuery(q); setDesignMode('pinterest'); }}><i className="bi bi-pinterest me-1" /> Pinterest</button>
                    <button type="button" className={`btn ${designMode === 'draw' ? 'btn-wl-gold' : 'btn-wl-outline border'}`} onClick={() => { stopCamera(); setDesignMode('draw'); setTimeout(() => initCanvas(canvasRef.current), 0); }}><i className="bi bi-pencil me-1" /> Draw</button>
                    <button type="button" className={`btn ${designMode === 'camera' ? 'btn-wl-gold' : 'btn-wl-outline border'}`} onClick={() => { setDesignMode('camera'); startCamera(); }}><i className="bi bi-camera me-1" /> Camera</button>
                  </div>

                  {designMode === 'ai-reference' ? (
                    <div>
                      <div className="border rounded-3 p-4 mb-3" style={{ background: 'var(--wl-surface)' }}>
                        <div className="d-flex align-items-start gap-3">
                          <div className="wl-avatar" style={{ flexShrink: 0 }}><i className="bi bi-stars" /></div>
                          <div className="flex-grow-1">
                            <h3 className="h6 mb-1">WorkLoom AI design references</h3>
                            <p className="small text-secondary mb-3">Find jewellery design references from the WorkLoom reference library based on the customer's requirements.</p>
                            <div className="input-group">
                              <input className="form-control" value={pinterestQuery} onChange={(e) => setPinterestQuery(e.target.value)} placeholder="Customer's extracted design request will appear here" />
                              <button type="button" className="btn btn-wl-gold" onClick={() => searchWorkloomReferences(pinterestQuery, { refresh: true })} disabled={referenceBusy}>{referenceBusy ? 'Matching…' : 'Find matches'}</button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {referenceError && <div className="alert alert-warning py-2">{referenceError}<div className="small mt-1">If this is the first run, start the backend setup script to download the jewellery reference library and build its index.</div></div>}
                      {referenceItems.length > 0 && (
                        <>
                          <div className="row g-3">
                            {referenceItems.map((item) => {
                              const imageUrl = item.image_url?.startsWith('http') ? item.image_url : `${API_BASE_URL}${item.image_url || ''}`;
                              const selected = form.designReferenceUrl === imageUrl;
                              return (
                                <div className="col-6 col-md-4" key={item.id}>
                                  <button type="button" className={`w-100 text-start border rounded-3 p-2 bg-white h-100 ${selected ? 'border-warning shadow-sm' : ''}`} onClick={() => { update('designImageUrl', imageUrl); update('designReferenceUrl', imageUrl); update('designSource', 'ai_library'); setDesignStudioOpen(false); }}>
                                    <img src={imageUrl} alt={item.title || 'WorkLoom jewellery reference'} className="w-100 rounded-2 border mb-2" style={{ aspectRatio: '1 / 1', objectFit: 'cover' }} />
                                    <div className="small fw-semibold text-truncate">{item.category || 'Jewellery'} reference</div>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <div className="d-flex justify-content-end align-items-center mt-3 gap-2">
                            <div className="d-flex gap-2">
                              <button type="button" className="btn btn-sm btn-wl-outline border" onClick={goBackReferenceResults} disabled={referenceBusy || referenceHistory.length === 0}>
                                <i className="bi bi-arrow-left me-1" /> Previous designs
                              </button>
                              <button type="button" className="btn btn-sm btn-wl-outline border" onClick={() => searchWorkloomReferences(pinterestQuery, { refresh: true })} disabled={referenceBusy}>
                                {referenceBusy ? 'Matching…' : 'More designs'}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                      {!referenceBusy && !referenceItems.length && !referenceError && <div className="border rounded p-4 text-center text-secondary small">Find six design references matched to this order.</div>}
                    </div>
                  ) : designMode === 'pinterest' ? (
                    <div>
                      <div className="border rounded-3 p-4 mb-3" style={{ background: 'var(--wl-surface)' }}>
                        <div className="d-flex align-items-start gap-3">
                          <div className="wl-avatar" style={{ background: '#e60023', color: '#fff', borderColor: '#e60023', flexShrink: 0 }}><i className="bi bi-pinterest" /></div>
                          <div className="flex-grow-1">
                            <h3 className="h6 mb-1">Pinterest design references</h3>
                            <p className="small text-secondary mb-3">WorkLoom searches Pinterest using the actual customer requirements extracted from this order.</p>
                            <div className="input-group">
                              <input className="form-control" value={pinterestQuery} onChange={(e) => setPinterestQuery(e.target.value)} placeholder="Customer's extracted design request will appear here" />
                              <button type="button" className="btn btn-wl-gold" onClick={() => searchPinterest()} disabled={pinterestBusy}>{pinterestBusy ? 'Searching…' : 'Search'}</button>
                            </div>
                            <div className="mt-3 pt-3 border-top">
                              <label className="form-label small fw-semibold" htmlFor="pinterestReferenceUrl">Add Pinterest Pin reference</label>
                              <div className="input-group">
                                <input id="pinterestReferenceUrl" className="form-control" value={pinterestPinInput} onChange={(e) => setPinterestPinInput(e.target.value)} placeholder="Paste a Pinterest Pin link here" />
                                <button type="button" className="btn btn-wl-outline border" onClick={() => {
                                  if (attachPinterestReference(pinterestPinInput)) setPinterestPinInput('');
                                }} disabled={pinterestAttachedRefs.length >= 4}>Add reference</button>
                              </div>
                              <div className="small text-secondary mt-1">Add up to 4 Pinterest references to keep multiple designs with this order.</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {pinterestError && <div className="alert alert-warning py-2">{pinterestError}</div>}
                      {pinterestAttachedRefs.length > 0 && (
                        <div className="border rounded-3 p-3 mb-3">
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <div className="fw-semibold small">Selected Pinterest references</div>
                            <div className="small text-secondary">{pinterestAttachedRefs.length}/4</div>
                          </div>
                          <div className="row g-3">
                            {pinterestAttachedRefs.map((url, index) => (
                              <div className="col-12 col-md-6" key={url}>
                                <div className="border rounded-3 p-2 h-100 bg-white">
                                  <div className="small fw-semibold mb-2">Design {index + 1}</div>
                                  <a data-pin-do="embedPin" href={url} aria-label={`Pinterest design reference ${index + 1}`}>{url}</a>
                                  <div className="d-flex justify-content-end mt-2">
                                    <button type="button" className="btn btn-sm btn-light border" onClick={() => removePinterestReference(url)}>Remove</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {pinterestItems.length > 0 && (
                        <>
                          <div className="row g-3">
                            {pinterestItems.map((pin) => (
                              <div className="col-6 col-md-4" key={pin.id}>
                                <button type="button" className={`w-100 text-start border rounded-3 p-2 bg-white h-100 ${pinterestAttachedRefs.includes(pin.pin_url) ? 'border-warning shadow-sm' : ''}`} onClick={() => { const url = pin.pin_url || ''; if (!url) return; if (pinterestAttachedRefs.includes(url)) removePinterestReference(url); else attachPinterestReference(url); }}>
                                  <img src={pin.image_url} alt={pin.alt_text || pin.title || 'Pinterest jewellery reference'} className="w-100 rounded-2 border mb-2" style={{ aspectRatio: '1 / 1', objectFit: 'cover' }} />
                                  <div className="d-flex justify-content-between gap-2 align-items-center">
                                    <div className="small fw-semibold text-truncate">{pin.title || 'Jewellery reference'}</div>
                                    <span className="small text-secondary">{pinterestAttachedRefs.includes(pin.pin_url) ? 'Selected' : 'Select'}</span>
                                  </div>
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="d-flex justify-content-end align-items-center mt-3">
                            <button type="button" className="btn btn-sm btn-wl-outline border" onClick={() => searchPinterest({ nextPage: true })} disabled={pinterestBusy || !pinterestBookmark}>
                              {pinterestBusy ? 'Loading…' : 'Refresh'}
                            </button>
                          </div>
                        </>
                      )}

                    </div>
                  ) : designMode === 'draw' ? (
                    <>
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                        <div className="d-flex flex-wrap gap-1">
                          <button type="button" className={`btn btn-sm ${drawTool === 'pencil' ? 'btn-wl-gold' : 'btn-light border'}`} onClick={() => setDrawTool('pencil')}>✏ Pencil</button>
                          <button type="button" className="btn btn-sm btn-light border" onClick={() => insertShape('circle')}>○ Circle</button>
                          <button type="button" className="btn btn-sm btn-light border" onClick={() => insertShape('rectangle')}>▢ Rectangle</button>
                          <button type="button" className="btn btn-sm btn-light border" onClick={() => insertShape('diamond')}>◇ Diamond</button>
                          <button type="button" className="btn btn-sm btn-light border" onClick={() => insertShape('ring')}>Ring</button>
                          <button type="button" className="btn btn-sm btn-light border" onClick={() => insertShape('bangle')}>Bangle</button>
                          <button type="button" className="btn btn-sm btn-light border" onClick={() => insertShape('pendant')}>Pendant</button>
                          <button type="button" className="btn btn-sm btn-light border" onClick={() => insertShape('necklace')}>Necklace</button>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          <label className="small text-secondary" htmlFor="brushSize">Brush</label>
                          <input id="brushSize" type="range" min="1" max="14" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
                          <button type="button" className="btn btn-sm btn-light border" onClick={clearCanvas}>Clear</button>
                        </div>
                      </div>
                      <canvas ref={canvasRef} className="wl-design-canvas" onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerLeave={stopDrawing} onPointerCancel={stopDrawing} />
                      <div className="d-flex justify-content-end gap-2 mt-3">
                        <button type="button" className="btn btn-wl-outline border" onClick={() => setDesignStudioOpen(false)}>Cancel</button>
                        <button type="button" className="btn btn-wl-gold" onClick={saveDrawnDesign} disabled={imageBusy}>{imageBusy ? 'Saving…' : 'Save design'}</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="wl-camera-frame">
                        {cameraOn ? <video ref={videoRef} className="wl-camera-video" playsInline muted /> : <div className="text-center text-secondary"><i className="bi bi-camera-video fs-1 d-block mb-2" />Click “Start camera” to capture a physical design.</div>}
                      </div>
                      <div className="d-flex justify-content-end gap-2 mt-3">
                        <button type="button" className="btn btn-wl-outline border" onClick={() => { stopCamera(); setDesignStudioOpen(false); }}>Cancel</button>
                        {!cameraOn ? <button type="button" className="btn btn-wl-gold" onClick={startCamera}>Start camera</button> : <button type="button" className="btn btn-wl-gold" onClick={captureCameraDesign} disabled={imageBusy}>{imageBusy ? 'Saving…' : 'Capture & save'}</button>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="wl-card p-3 p-md-4 mb-3">
              {(() => {
                const aiRan = Boolean(aiValidation);
                const originalMissing = aiValidation?.original_missing_fields || [];
                const finalMissing = finalMissingKeys();
                const resolved = originalMissing.filter((field) => !finalMissing.includes(field));
                const stillMissing = finalMissing;
                return (
                  <>
                    <div className="d-flex justify-content-between align-items-start gap-3">
                      <div><h2 className="wl-section-title h6 mb-1">AI review gate</h2><div className="small text-secondary">AI reports what it could and could not hear. Owner edits can resolve missing fields before approval.</div></div>
                      <span className={`badge rounded-pill ${!aiRan ? 'text-bg-secondary' : stillMissing.length ? 'text-bg-warning' : 'text-bg-success'}`}>{!aiRan ? 'Waiting for AI extraction' : stillMissing.length ? 'Review required' : 'Ready for owner approval'}</span>
                    </div>
                    {!aiRan ? (
                      <div className="alert alert-light border py-2 mt-3 mb-0">Use <strong>Extract order details with AI</strong> after the voice transcript is ready. The gate will then show exactly what the AI missed.</div>
                    ) : (
                      <>
                        <div className="border rounded-3 mt-3 overflow-hidden">
                          {[['customer_name', form.customer], ['item', form.item], ['material', form.metal], ['weight', form.weight ? `${form.weight} g` : ""], ['stones', form.stones], ['due_date', form.dueDate], ['notes', form.notes]].map(([key, value], index) => {
                            return (
                              <div key={key} className={`d-flex justify-content-between gap-3 px-3 py-2 small ${index ? 'border-top' : ''}`}>
                                <div className="fw-semibold">{labelForField(key)}</div>
                                <div className="text-end">
                                  <div>{value || <span className="text-secondary">Not provided</span>}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {originalMissing.length > 0 && <div className="alert alert-warning py-2 mt-3 mb-2"><strong>AI could not find:</strong> {originalMissing.map(labelForField).join(', ')}.</div>}
                        {resolved.length > 0 && <div className="alert alert-success py-2 mt-2 mb-2"><strong>Resolved by owner:</strong> {resolved.map(labelForField).join(', ')}.</div>}
                        {stillMissing.length > 0 ? <div className="alert alert-danger py-2 mt-2 mb-2"><strong>Still missing:</strong> {stillMissing.map(labelForField).join(', ')}.</div> : <div className="alert alert-success py-2 mt-2 mb-2"><strong>All required fields are present.</strong> Owner-entered corrections are included in this review.</div>}
                        <label className="d-flex gap-2 align-items-start small mt-3"><input type="checkbox" checked={form.aiReviewed} onChange={(e) => setForm((current) => ({ ...current, aiReviewed: e.target.checked }))} /><span>I reviewed the AI-extracted requirements and any owner corrections.</span></label>
                      </>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="wl-card p-3 p-md-4">
              <h2 className="wl-section-title h6 mb-3">Assignment &amp; scheduling</h2>
              <div className="row g-3">
                <div className="col-md-6"><label className="wl-form-label" htmlFor="karigar">Assign karigar</label><div className="d-flex gap-2"><select id="karigar" className="form-select" value={form.karigarId} onChange={(e) => update('karigarId', e.target.value)} disabled={teamBusy || team.length === 0}>{team.length === 0 ? <option value="">No karigars added yet</option> : team.map((k) => <option key={k.id} value={k.id}>{k.name} — {k.specialty}</option>)}</select><button type="button" className="btn btn-wl-outline border text-nowrap" onClick={getRecommendation} disabled={recommendBusy}>{recommendBusy ? 'Checking…' : 'Recommend'}</button></div>{selectedKarigar && <div className="form-text">Workshop member · {selectedKarigar.specialty}</div>}{recommendation?.recommended && <div className="small mt-2"><span className="badge rounded-pill" style={{background:'var(--wl-emerald-soft)',color:'var(--wl-emerald)'}}>Recommended</span> {recommendation.recommended.name} · {recommendation.recommended.active_orders} active</div>}</div>
                <div className="col-md-6"><label className="wl-form-label" htmlFor="priority">Priority</label><select id="priority" className="form-select" value={form.priority} onChange={(e) => update('priority', e.target.value)}><option>High</option><option>Medium</option><option>Low</option></select></div>
                <div className="col-md-6"><label className="wl-form-label" htmlFor="dueDate">Promised delivery date</label><input id="dueDate" type="date" className="form-control" value={form.dueDate} onChange={(e) => update('dueDate', e.target.value)} required /></div>
                <div className="col-md-3"><label className="wl-form-label" htmlFor="advance">Advance received (₹)</label><input id="advance" type="number" min="0" className="form-control" placeholder="0" value={form.advance} onChange={(e) => update('advance', e.target.value)} /></div>
                <div className="col-md-3"><label className="wl-form-label" htmlFor="estimateValue">Final estimate (₹)</label><input id="estimateValue" type="number" min="0" className="form-control" placeholder="e.g. 125000" value={form.estimateValue} onChange={(e) => update('estimateValue', e.target.value)} /></div>
                <div className="col-12"><div className="small text-secondary">Pricing is owner-confirmed. Workloom does not fetch or assume a market gold rate.</div></div>
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="wl-card p-3 p-md-4" style={{ position: 'sticky', top: 90 }}>
              <h2 className="wl-section-title h6 mb-3">Order summary</h2>
              <dl className="mb-0">
                <SummaryRow label="Customer" value={form.customer || '—'} />
                <SummaryRow label="Item" value={`${form.item} · ${form.metal}`} />
                <SummaryRow label="Weight" value={form.weight ? `${form.weight} g` : '—'} />
                <SummaryRow label="Stones" value={form.stones} />
                <SummaryRow label="Karigar" value={selectedKarigar?.name || '—'} />
                <SummaryRow label="Priority" value={form.priority} />
                <SummaryRow label="Due date" value={form.dueDate || '—'} />
                <SummaryRow label="Estimated value" value={form.estimateValue ? `₹${Number(form.estimateValue).toLocaleString('en-IN')}` : '—'} />
              </dl>
              {(form.estimateValue || form.advance) ? <div className="wl-estimate-box mt-3"><div className="wl-price-line wl-price-total"><span>Owner-confirmed estimate</span><strong>₹{Math.round(Number(form.estimateValue) || 0).toLocaleString('en-IN')}</strong></div><div className="wl-price-line"><span>Advance received</span><strong>₹{Math.round(Number(form.advance) || 0).toLocaleString('en-IN')}</strong></div><div className="wl-price-line"><span>Remaining balance</span><strong>₹{Math.round(calculatedBalance).toLocaleString('en-IN')}</strong></div></div> : null}
              <button type="submit" className="btn btn-wl-gold w-100 mt-4" disabled={saving}>{saving ? 'Saving to MongoDB…' : 'Create order'}</button>
            </div>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
}

function SummaryRow({ label, value }) {
  return <div className="d-flex justify-content-between py-2" style={{ borderBottom: '1px solid var(--wl-line)' }}><dt className="text-secondary fw-normal">{label}</dt><dd className="mb-0 fw-semibold text-end">{value}</dd></div>;
}
