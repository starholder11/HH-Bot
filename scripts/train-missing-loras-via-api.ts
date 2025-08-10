#!/usr/bin/env tsx

// Train LoRAs by calling server APIs so server-side creds are used

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

type CanvasSummary = { id: string; name: string; key?: string }

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.json() as Promise<T>
}

async function fetchCanvasIndex(): Promise<CanvasSummary[]> {
  const idx = await fetchJSON<any>(`${BASE}/api/canvas`)
  return Array.isArray(idx?.items) ? idx.items : []
}

async function fetchCanvas(id: string): Promise<any> {
  const res = await fetch(`${BASE}/api/canvas?id=${encodeURIComponent(id)}`)
  const j = await res.json()
  if (!res.ok) throw new Error(j?.error || `Failed to load canvas ${id}`)
  return j.canvas
}

async function trainLora(canvasId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/canvas/train-lora`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canvasId, triggerWord: 'CANVAS_STYLE' }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error || `Training start failed (${res.status})`)
}

function hasCompletedLora(canvas: any): boolean {
  const loras = Array.isArray(canvas?.loras) ? canvas.loras : []
  return loras.some((l: any) => (l?.status || '').toLowerCase() === 'completed' || (l?.status || '').toUpperCase() === 'COMPLETED')
}

function hasEnoughImages(canvas: any): boolean {
  const items = Array.isArray(canvas?.items) ? canvas.items : []
  const urls = items
    .filter((it: any) => (it?.type || '').toLowerCase() === 'image')
    .map((it: any) => it?.metadata?.cloudflare_url || it?.metadata?.s3_url)
    .filter((u: any) => typeof u === 'string' && /^https?:\/\//i.test(u))
  return urls.length >= 3
}

async function main() {
  console.log(`Using server: ${BASE}`)
  const index = await fetchCanvasIndex()
  console.log(`Canvases: ${index.length}`)

  let queued = 0
  for (const c of index) {
    try {
      const canvas = await fetchCanvas(c.id)
      if (hasCompletedLora(canvas)) continue
      if (!hasEnoughImages(canvas)) continue
      await trainLora(canvas.id)
      queued++
      console.log(`Queued LoRA for ${canvas.name} (${canvas.id})`)
    } catch (e: any) {
      console.error(`Failed for ${c.name || c.id}:`, e?.message || e)
    }
  }
  console.log(`Done. Queued ${queued} trainings.`)
}

main().catch(err => { console.error(err); process.exit(1) })


