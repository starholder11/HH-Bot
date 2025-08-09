import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { uploadFile, readJsonFromS3 } from '@/lib/s3-upload'

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

    // Download and bundle images into a tar-like binary (simple concatenation with JSON manifest)
    // Avoiding JSZip to minimize dependencies for now; FAL supports images_data_url as a remote URL
    // We'll upload a JSON manifest with URLs instead, which `flux-lora-fast-training` accepts as well.
    const manifest = { images: imageUrls }
    const buffer = Buffer.from(JSON.stringify(manifest))
    const uploaded = await uploadFile(buffer, 'canvas-training')

    // Submit training job
    const input = {
      images_data_url: uploaded.url,
      trigger_word: triggerWord,
      is_style: true,
    }

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
    const updateRes = await fetch(`${base}/api/canvas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: canvasId, loras: [ ...(canvas?.loras || []), loraEntry ] }),
    } as any)
    if (!updateRes.ok) {
      console.warn('Failed to update canvas with LoRA entry')
    }

    return NextResponse.json({ success: true, requestId: queued.request_id, lora: loraEntry })
  } catch (e: any) {
    console.error('[train-lora] error:', e)
    return NextResponse.json({ error: e?.message || 'Training failed' }, { status: 500 })
  }
}


