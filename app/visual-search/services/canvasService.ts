export async function listCanvases() {
  const res = await fetch('/api/canvas', { method: 'GET' });
  if (!res.ok) throw new Error('Failed to list canvases');
  return res.json();
}

export async function getCanvas(id: string) {
  const res = await fetch(`/api/canvas?id=${encodeURIComponent(id)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Failed to load canvas');
  return json;
}

export async function saveCanvas(payload: any) {
  const res = await fetch('/api/canvas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Save failed');
  return json;
}

export async function updateCanvas(payload: any) {
  const res = await fetch('/api/canvas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Update failed');
  return json;
}

export async function getCanvasLoras(canvasId: string) {
  const res = await fetch(`/api/canvas/loras?id=${encodeURIComponent(canvasId)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Failed to fetch canvas LoRAs');
  return json;
}

export async function trainLora(canvasId: string, triggerWord: string) {
  const res = await fetch('/api/canvas/train-lora', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canvasId, triggerWord }) });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Training start failed');
  return json;
}

export async function getTrainStatus(requestId: string, canvasId: string) {
  const url = `/api/canvas/train-status?requestId=${encodeURIComponent(requestId)}&canvasId=${encodeURIComponent(canvasId)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Status failed');
  return json;
}

export async function listAllLoras() {
  const res = await fetch('/api/loras');
  if (!res.ok) throw new Error('Failed to fetch all LoRAs');
  return res.json();
}



