import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { uploadFile, readJsonFromS3 } from '@/lib/s3-upload'
import JSZip from 'jszip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function fetchCanvas(canvasId: string) {
  // Load via S3 like /api/canvas does to avoid internal fetch and URL issues
  try {
    // Try index first
    const index = await readJsonFromS3('canvases/index.json')
    const entry = (index?.items || []).find((it: any) => it.id === canvasId)
    const key = entry?.key || `canvases/${canvasId}.json`
    const canvas = await readJsonFromS3(key)
    return canvas
  } catch (e) {
    // Fallback direct
    try {
      const key = `canvases/${canvasId}.json`
      const canvas = await readJsonFromS3(key)
      return canvas
    } catch {
      throw new Error('Canvas not found')
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { canvasId, baseModel = 'fal-ai/flux.1-dev', triggerWord = 'CANVAS_STYLE' } = await req.json()
    if (!canvasId) return NextResponse.json({ error: 'canvasId is required' }, { status: 400 })

    const apiKey = (process.env.FAL_KEY || '').trim()
    if (!apiKey) return NextResponse.json({ error: 'FAL_KEY not set' }, { status: 500 })
    fal.config({ credentials: apiKey })

    const canvas = await fetchCanvas(canvasId)
    const items: any[] = Array.isArray(canvas?.items) ? canvas.items : []
    // Extract image URLs from item metadata
    const imageUrls: string[] = items
      .filter((it) => (it?.type || '').toLowerCase() === 'image')
      .map((it) => it?.metadata?.cloudflare_url || it?.metadata?.s3_url)
      .filter((u: any): u is string => typeof u === 'string' && /^https?:\/\//i.test(u))

    if (imageUrls.length < 3) {
      return NextResponse.json({ error: 'At least 3 image items are required to train a LoRA' }, { status: 400 })
    }

    // Build a proper ZIP of images for FAL trainer
    const zip = new JSZip()
    const addPromises = imageUrls.slice(0, 24).map(async (url, idx) => {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`Failed to fetch image: ${url}`)
      const arr = await resp.arrayBuffer()
      const ext = (() => {
        try { return new URL(url).pathname.split('.').pop() || 'jpg' } catch { return 'jpg' }
      })()
      zip.file(`image_${idx + 1}.${ext}`, arr)
    })
    await Promise.all(addPromises)
    const zipBuffer: Buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    const uploaded = await uploadFile(zipBuffer, 'canvas-training')

    // Submit training job
    const input = {
      images_data_url: uploaded.url,
      trigger_word: triggerWord,
      is_style: true,
    } as any

    const queued = await fal.queue.submit('fal-ai/flux-lora-fast-training', { input } as any)

    // Persist LoRA metadata onto canvas
    const loraEntry = {
      provider: 'fal',
      family: 'flux',
      baseModel,
      triggerWord,
      version: 1,
      status: 'training',
      images: imageUrls.length,
      requestId: queued.request_id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || 
                 (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    // Persist to S3 directly to avoid race with index based PUT
    try {
      // Resolve key via index if present
      let key = `canvases/${canvasId}.json`
      try {
        const index = await readJsonFromS3('canvases/index.json')
        const entry = (index?.items || []).find((it: any) => it.id === canvasId)
        if (entry?.key) key = entry.key
      } catch {}
      const next = { ...canvas, loras: [ ...(canvas?.loras || []), loraEntry ], updatedAt: new Date().toISOString() }
      // Reuse existing writer in s3-upload
      const { writeJsonAtKey } = await import('@/lib/s3-upload')
      await writeJsonAtKey(key, next)
    } catch (e) {
      console.warn('Failed to persist LoRA entry directly to S3:', e)
    }

    return NextResponse.json({ success: true, requestId: queued.request_id, lora: loraEntry })
  } catch (e: any) {
    console.error('[train-lora] error:', e)
    return NextResponse.json({ error: e?.message || 'Training failed' }, { status: 500 })
  }
}


