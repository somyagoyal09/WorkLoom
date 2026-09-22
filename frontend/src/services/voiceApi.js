import { apiRequest } from './api.js';

export async function transcribeVoice(blob) {
  const formData = new FormData();
  const mime = blob?.type || 'audio/webm';
  const extension = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
  formData.append('file', blob, `workloom-voice.${extension}`);

  return apiRequest('/voice/transcribe', {
    method: 'POST',
    body: formData,
  });
}

export async function extractOrderFields(transcript) {
  return apiRequest('/voice/extract', {
    method: 'POST',
    body: JSON.stringify({ transcript }),
  });
}
