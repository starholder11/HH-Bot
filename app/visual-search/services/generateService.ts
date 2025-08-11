import type { GenerateRequest, GenerateResponse } from '../types';

export type GenerateMode = 'image' | 'audio' | 'text' | 'video';

export async function runGenerate(body: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Generation failed');
  return json as GenerateResponse;
}



