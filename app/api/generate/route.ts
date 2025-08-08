import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { uploadImage, uploadFile } from '@/lib/s3-upload'

// High-level generation endpoint backed by FAL
// Body: { mode: 'image'|'audio'|'text'|'video', model?: string, prompt: string, refs?: string[], options?: any }
// For now, supports image and audio, returns persisted S3 URL and raw FAL result

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { mode, model, prompt, refs = [], options = {} } = await req.json()

    if (!mode || !prompt) {
      return NextResponse.json({ error: 'mode and prompt are required' }, { status: 400 })
    }

    const apiKey = (process.env.FAL_KEY || '').trim()
    if (!apiKey) {
      return NextResponse.json({ error: 'FAL_KEY not set' }, { status: 500 })
    }
    fal.config({ credentials: apiKey })

    // Default models can be swapped later; these are popular text->image/audio entries on FAL
    const defaults: Record<string, string> = {
      image: 'fal-ai/fast-sdxl',
      audio: 'fal-ai/tts',
      text: 'fal-ai/llama-3.1',
      video: 'fal-ai/image-to-video',
    }

    const selectedModel = model || defaults[mode]
    if (!selectedModel) {
      return NextResponse.json({ error: `No default model for mode ${mode}` }, { status: 400 })
    }

    // Basic input shaping; pass prompt and refs; allow options passthrough
    const input: any = { prompt, refs, ...options }
    if (Array.isArray(refs) && refs.length > 0) {
      // Common conventions across many models
      input.image_url = input.image_url || refs[0]
      input.image_urls = input.image_urls || refs
      input.ref_images = input.ref_images || refs
      input.reference_images = input.reference_images || refs
    }

    // Prefer subscribe to accommodate queueing/long jobs
    let anyResult: any
    try {
      anyResult = await fal.subscribe(selectedModel, { input, logs: true, onQueueUpdate: () => {} } as any)
    } catch {
      anyResult = await fal.run(selectedModel, { input } as any)
    }

    // Persist outputs to S3 when applicable
    if (mode === 'image') {
      // Expecting image bytes/URL in result; try common fields
      const imageBytes: string | undefined = (anyResult?.images?.[0]?.b64_json) || anyResult?.image?.b64_json || anyResult?.data?.images?.[0]?.b64_json
      const imageUrl: string | undefined = anyResult?.images?.[0]?.url || anyResult?.image?.url || anyResult?.data?.images?.[0]?.url

      if (imageBytes) {
        const buffer = Buffer.from(imageBytes, 'base64')
        const uploaded = await uploadImage(buffer, { format: 'jpeg', quality: 90 })
        return NextResponse.json({ success: true, url: uploaded.url, storage: uploaded, result: anyResult })
      }
      if (imageUrl) {
        // Optional: fetch and rehost; for now, return the URL directly
        return NextResponse.json({ success: true, url: imageUrl, result: anyResult })
      }
      // If we found an image URL in a nested shape, surface it at top-level for convenience
      if (imageUrl) {
        return NextResponse.json({ success: true, url: imageUrl, result: anyResult })
      }
      return NextResponse.json({ success: true, result: anyResult })
    }

    if (mode === 'audio') {
      // Try common fields for audio
      const audioB64: string | undefined = anyResult?.audio?.b64_json || anyResult?.b64_json
      const audioUrl: string | undefined = anyResult?.audio?.url || anyResult?.url

      if (audioB64) {
        const buffer = Buffer.from(audioB64, 'base64')
        const uploaded = await uploadFile(buffer, 'audio')
        return NextResponse.json({ success: true, url: uploaded.url, storage: uploaded, result: anyResult })
      }
      if (audioUrl) {
        return NextResponse.json({ success: true, url: audioUrl, result: anyResult })
      }
      return NextResponse.json({ success: true, result: anyResult })
    }

    // For video/text, try to surface a convenient url if present
    if (mode === 'video') {
      const videoUrl: string | undefined = anyResult?.video?.url || anyResult?.data?.video?.url || anyResult?.output?.url || anyResult?.outputs?.[0]?.url
      if (videoUrl) {
        return NextResponse.json({ success: true, url: videoUrl, result: anyResult })
      }
    }
    return NextResponse.json({ success: true, result: anyResult })
  } catch (err: any) {
    console.error('[api/generate] error:', err)
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 })
  }
}


