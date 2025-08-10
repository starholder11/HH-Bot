#!/usr/bin/env tsx

import './bootstrap-env'
import { readJsonFromS3, writeJsonAtKey, listKeys } from '../lib/s3-upload'
import { fal } from '@fal-ai/client'
import JSZip from 'jszip'

type Canvas = {
  id: string
  name: string
  items: any[]
  loras?: any[]
}

async function listAllCanvasKeys(): Promise<string[]> {
  try {
    const keys = await listKeys('canvases/', 10000)
    return keys.filter(k => k.endsWith('.json') && !k.endsWith('/index.json'))
  } catch {
    return []
  }
}

async function loadCanvas(key: string): Promise<Canvas | null> {
  try {
    const c = await readJsonFromS3(key)
    return c
  } catch {
    return null
  }
}

function getImageUrlsForTraining(canvas: Canvas): string[] {
  const items = Array.isArray(canvas.items) ? canvas.items : []
  const urls = items
    .filter(it => (it?.type || '').toLowerCase() === 'image')
    .map(it => it?.metadata?.cloudflare_url || it?.metadata?.s3_url)
    .filter((u: any): u is string => typeof u === 'string' && /^https?:\/\//i.test(u))
  return Array.from(new Set(urls))
}

function hasCompletedLora(canvas: Canvas): boolean {
  const loras = Array.isArray(canvas.loras) ? canvas.loras : []
  return loras.some(l => (l?.status || '').toLowerCase() === 'completed' || (l?.status || '').toUpperCase() === 'COMPLETED')
}

async function enqueueTrainingForCanvas(canvas: Canvas, key: string) {
  const apiKey = (process.env.FAL_KEY || '').trim()
  if (!apiKey) throw new Error('FAL_KEY not set')
  fal.config({ credentials: apiKey })

  const imageUrls = getImageUrlsForTraining(canvas)
  if (imageUrls.length < 3) {
    console.log(`Skipping ${canvas.name} (${canvas.id}) – not enough images (${imageUrls.length})`)
    return
  }

  const zip = new JSZip()
  const addPromises = imageUrls.slice(0, 24).map(async (url, idx) => {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Failed to fetch image: ${url}`)
    const arr = await resp.arrayBuffer()
    const ext = (() => { try { return new URL(url).pathname.split('.').pop() || 'jpg' } catch { return 'jpg' } })()
    zip.file(`image_${idx + 1}.${ext}`, arr)
  })
  await Promise.all(addPromises)
  const zipBuffer: Buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  // Reuse uploadFile from s3-upload via dynamic import to avoid circular deps in some envs
  const { uploadFile } = await import('../lib/s3-upload')
  const uploaded = await uploadFile(zipBuffer, 'canvas-training')

  const input: any = { images_data_url: uploaded.url, trigger_word: 'CANVAS_STYLE', is_style: true }
  const queued = await fal.queue.submit('fal-ai/flux-lora-fast-training', { input } as any)

  const loraEntry = {
    provider: 'fal',
    family: 'flux',
    baseModel: 'fal-ai/flux.1-dev',
    triggerWord: 'CANVAS_STYLE',
    version: 1,
    status: 'training',
    images: imageUrls.length,
    requestId: queued.request_id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const updated = { ...canvas, loras: [ ...(canvas.loras || []), loraEntry ], updatedAt: new Date().toISOString() }
  await writeJsonAtKey(key, updated)
  // Also bump index timestamp if present
  try {
    const idx = await readJsonFromS3('canvases/index.json')
    const items: any[] = Array.isArray(idx?.items) ? idx.items : []
    const i = items.findIndex((it: any) => it.id === canvas.id)
    if (i >= 0) { items[i].updatedAt = updated.updatedAt; await writeJsonAtKey('canvases/index.json', { items }) }
  } catch {}

  console.log(`Queued LoRA training for canvas ${canvas.name} (${canvas.id}) → ${queued.request_id}`)
}

async function main() {
  const keys = await listAllCanvasKeys()
  console.log(`Scanning ${keys.length} canvases for missing LoRAs...`)

  for (const key of keys) {
    try {
      const c = await loadCanvas(key)
      if (!c) continue
      if (hasCompletedLora(c)) continue
      await enqueueTrainingForCanvas(c, key)
    } catch (e) {
      console.error(`Failed processing ${key}:`, e)
    }
  }
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })


