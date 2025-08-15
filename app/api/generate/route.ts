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
    const normalizedModel = (() => {
      const m = (model || '').toString().trim().toLowerCase()
      if (!m || m === 'default' || m === 'auto' || m === 'none') return undefined
      return model
    })()

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
      // Use WAN-2.1 as default video model - faster, higher quality, better response structure
      video: 'fal-ai/wan-i2v',
    }

    // Infer effective mode from model id when caller passed a mismatched mode
    const inferModeFromModel = (modelId?: string, fallback?: string): 'image'|'audio'|'text'|'video' => {
      const m = (modelId || '').toLowerCase()
      if (m.includes('image-to-video') || m.includes('/video') || m.includes('video/') || m.includes('wan-i2v') || m.includes('i2v')) return 'video'
      if (m.includes('tts') || m.includes('text-to-speech')) return 'audio'
      if (m.includes('llama') || m.includes('text/')) return 'text'
      return (fallback as any) || 'image'
    }
    const effectiveMode = inferModeFromModel(normalizedModel, mode)

    // If caller supplied LoRAs via options, force a FLUX LoRA-capable model for image mode
    const hasLoras = Array.isArray((options as any)?.loras) && (options as any).loras.length > 0
    let selectedModel: string = (hasLoras && effectiveMode === 'image') ? 'fal-ai/flux-lora' : (normalizedModel || defaults[effectiveMode])
    if (!selectedModel) {
      return NextResponse.json({ error: `No default model for mode ${effectiveMode}` }, { status: 400 })
    }

    // Filter refs to URL-like strings only to avoid titles leaking into provider params
    const urlLike = (s: unknown): s is string => typeof s === 'string' && /^https?:\/\//i.test(s)
    const filteredRefs: string[] = Array.isArray(refs) ? refs.filter(urlLike) : []
    // Basic input shaping; pass prompt and refs; allow options passthrough
    const input: any = { prompt, refs: filteredRefs, ...options }
    // If any LoRA triggerWord provided, append to prompt to activate style
    try {
      const lorasIn = Array.isArray((options as any)?.loras) ? (options as any).loras : []
      const triggers = lorasIn.map((l: any) => l?.triggerWord).filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      if (triggers.length > 0) {
        input.prompt = `${prompt}\n\n${triggers.map((t: string) => t.trim()).join(' ')}`
      }
    } catch {}
    if (Array.isArray(filteredRefs) && filteredRefs.length > 0) {
      // Common conventions across many models
      input.image_url = input.image_url || filteredRefs[0]
      input.image_urls = input.image_urls || filteredRefs
      input.ref_images = input.ref_images || filteredRefs
      input.reference_images = input.reference_images || filteredRefs
    }

    // Auto-detect LoRA by trigger word present in prompt if none explicitly provided
    let lorasFromPrompt: Array<{ path: string; scale: number }> = []
    if (!hasLoras && effectiveMode === 'image') {
      try {
        const res = await fetch(`${process.env.PUBLIC_API_BASE_URL || ''}/api/loras` || '/api/loras', { next: { revalidate: 0 } })
        if (res.ok) {
          const list = await res.json()
          const p = (input.prompt || '').toString().toLowerCase()
          const matches = Array.isArray(list) ? list.filter((l: any) => (l.triggerWord || '').toLowerCase() && p.includes((l.triggerWord || '').toLowerCase())) : []
          if (matches.length > 0) {
            lorasFromPrompt = matches.map((m: any) => ({ path: m.artifactUrl || m.path, scale: 1.0 }))
            selectedModel = 'fal-ai/flux-lora'
            console.log('[api/generate] ✅ Auto-detected LoRAs from prompt; forcing flux-lora:', lorasFromPrompt)
          }
        }
      } catch {}
    }

    // Attach LoRAs if provided in options or detected from prompt, when using a FLUX model
    if (selectedModel.includes('flux')) {
      if (hasLoras) {
        const loras = (options as any).loras as any[]
        input.loras = loras.map((l) => ({ path: l.artifactUrl || l.path, scale: l.scale ?? 1.0 }))
      } else if (lorasFromPrompt.length > 0) {
        input.loras = lorasFromPrompt
      }
    }

    // Sanitize video-specific inputs to avoid 422s from provider
    if (effectiveMode === 'video') {
      // Coerce duration to seconds number and clamp to reasonable provider limits (e.g., many models cap at 6s)
      const coerceDurationSeconds = (val: unknown): number | undefined => {
        if (val == null) return undefined
        if (typeof val === 'number' && Number.isFinite(val)) return val
        if (typeof val === 'string') {
          const trimmed = val.trim().toLowerCase()
          // Formats: "30s", "00:00:30", "30"
          if (/^\d+\s*s$/.test(trimmed)) return Number(trimmed.replace('s', ''))
          if (/^\d+$/.test(trimmed)) return Number(trimmed)
          const mmss = trimmed.split(':').map((p) => Number(p))
          if (mmss.every((n) => Number.isFinite(n))) {
            // support h:mm:ss or mm:ss
            let secs = 0
            if (mmss.length === 2) secs = mmss[0] * 60 + mmss[1]
            if (mmss.length === 3) secs = mmss[0] * 3600 + mmss[1] * 60 + mmss[2]
            if (secs > 0) return secs
          }
        }
        return undefined
      }
      const coerced = coerceDurationSeconds(input.duration)
      const durationSec = Math.max(1, Math.min(coerced ?? 5, 6))
      input.duration = durationSec
      // Remove fields that commonly cause provider 422s
      delete input.style
      delete input.refs
      // If refs were provided but none are valid URLs, fail fast with guidance
      if ((!Array.isArray(filteredRefs) || filteredRefs.length === 0)) {
        return NextResponse.json({ error: 'Video generation requires valid image refs (absolute URLs). Got none or invalid. Ensure refs[] contains full http(s) URLs.' }, { status: 400 })
      }
    }

    const runFal = async (modelId: string): Promise<any> => {
      console.log(`[api/generate] 🔵 Attempting ${modelId} with input:`, JSON.stringify(input, null, 2))
      console.log(`[api/generate] 🔵 Model: ${modelId}, Mode: ${effectiveMode}`)
      try {
        console.log(`[api/generate] 🔵 Starting fal.subscribe for ${modelId}...`)
        const result = await fal.subscribe(modelId, { input, logs: true, onQueueUpdate: (update: any) => {
          console.log(`[api/generate] 🟡 Queue update for ${modelId}:`, update)
        } } as any)
        console.log(`[api/generate] 🟢 fal.subscribe SUCCESS for ${modelId}:`, JSON.stringify(result, null, 2))
        return result
      } catch (e: any) {
        console.warn(`[api/generate] 🟠 fal.subscribe failed for ${modelId}: ${e?.message || e}`)
        // Fallback to non-subscribe run
        try {
          console.log(`[api/generate] 🔵 Fallback to fal.run for ${modelId}...`)
          const result = await fal.run(modelId, { input } as any)
          console.log(`[api/generate] 🟢 fal.run SUCCESS for ${modelId}:`, JSON.stringify(result, null, 2))
          return result
        } catch (e2: any) {
          console.error(`[api/generate] 🔴 Both fal.subscribe and fal.run FAILED for ${modelId}:`, e2?.message || e2)
          throw e2
        }
      }
    }

    // If an image-to-video model is requested but no refs were provided, fail fast with guidance
    if (effectiveMode === 'video' && (!Array.isArray(refs) || refs.length === 0)) {
      return NextResponse.json({ error: `Video generation requires a pinned/uploaded image reference. Please provide refs[] (image URLs) on the request.` }, { status: 400 })
    }
    if (effectiveMode === 'video' && typeof selectedModel === 'string' && selectedModel.includes('text-to-video')) {
      return NextResponse.json({ error: `Text-to-video is not enabled in this environment. Pin an image and use an image-to-video model.` }, { status: 400 })
    }

    // Try requested model; if it fails, fall back to default for the mode
    let anyResult: any
    try {
      anyResult = await runFal(selectedModel)
    } catch (err: any) {
      const msg = (err?.message || '').toString().toLowerCase()
      const defaultModel = defaults[effectiveMode]
      if (selectedModel !== defaultModel) {
        try {
          const fallback = await runFal(defaultModel)
          // Return result but annotate we used fallback
          return NextResponse.json({ success: true, url: fallback?.video?.url || fallback?.images?.[0]?.url || fallback?.image?.url || fallback?.audio?.url || fallback?.data?.images?.[0]?.url || fallback?.data?.video?.url, result: fallback, note: `Requested model '${selectedModel}' failed (${msg || 'error'}). Fell back to default '${defaultModel}'.` })
        } catch (err2: any) {
          // If fallback also fails, return explicit error
          return NextResponse.json({ error: `Generation failed for requested model '${selectedModel}' and default '${defaultModel}': ${(err2?.message || msg || 'Unknown error')}` }, { status: 500 })
        }
      }
      // No alternative to try
      return NextResponse.json({ error: `Generation failed: ${msg || 'Unknown error'}` }, { status: 500 })
    }

    // Persist outputs to S3 when applicable
    if (effectiveMode === 'image') {
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

    if (effectiveMode === 'audio') {
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
    if (effectiveMode === 'video') {
      // WAN-2.1 returns { "video": { "url": "..." } }, Kling returns different structure
      const videoUrl: string | undefined = anyResult?.video?.url || anyResult?.data?.video?.url || anyResult?.output?.url || anyResult?.outputs?.[0]?.url
      console.log(`[api/generate] 🔍 Video URL extraction - found:`, videoUrl)
      console.log(`[api/generate] 🔍 Video result structure:`, {
        'anyResult?.video?.url': anyResult?.video?.url,
        'anyResult?.data?.video?.url': anyResult?.data?.video?.url,
        'anyResult?.output?.url': anyResult?.output?.url,
        'anyResult?.outputs?.[0]?.url': anyResult?.outputs?.[0]?.url
      })
      if (videoUrl) {
        console.log(`[api/generate] 🟢 Returning video URL:`, videoUrl)
        return NextResponse.json({ success: true, url: videoUrl, result: anyResult })
      }
    }
    // If nothing matched, include a diagnostic hint so the UI can show more detail quickly
    const fallbackUrl = anyResult?.url || anyResult?.images?.[0]?.url || anyResult?.image?.url || anyResult?.audio?.url || anyResult?.data?.images?.[0]?.url
    console.log(`[api/generate] 🔍 Fallback URL extraction - found:`, fallbackUrl)
    return NextResponse.json({ success: true, url: fallbackUrl, result: anyResult })
    } catch (err: any) {
    console.error('[api/generate] error:', err)
    const details = (err && typeof err === 'object') ? (err.response?.data || err.data || err.details) : undefined
    return NextResponse.json({ error: err?.message || 'Unknown error', details, stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined }, { status: 500 })
  }
}


