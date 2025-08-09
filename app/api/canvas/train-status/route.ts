import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { readJsonFromS3, writeJsonAtKey } from '@/lib/s3-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const requestId = searchParams.get('requestId') || ''
    const canvasId = searchParams.get('canvasId') || ''
    if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

    const apiKey = (process.env.FAL_KEY || '').trim()
    if (!apiKey) return NextResponse.json({ error: 'FAL_KEY not set' }, { status: 500 })
    fal.config({ credentials: apiKey })

    const status = await fal.queue.status('fal-ai/flux-lora-fast-training', { requestId } as any)

    // If completed, attempt to fetch result and persist artifact URL onto canvas
    let updated = null as any
    if (status?.status === 'COMPLETED' && canvasId) {
      try {
        const res = await fal.queue.result('fal-ai/flux-lora-fast-training', { requestId } as any)
        const artifactUrl = (res as any)?.diffusers_lora_file?.url || (res as any)?.safetensors_file?.url || (res as any)?.lora_file?.url
        if (artifactUrl) {
          // Merge onto canvas.loras[] matching this requestId directly via S3
          try {
            // Lookup key from index
            let key = `canvases/${canvasId}.json`
            try {
              const index = await readJsonFromS3('canvases/index.json')
              const entry = (index?.items || []).find((it: any) => it.id === canvasId)
              if (entry?.key) key = entry.key
            } catch {}
            const canvas = await readJsonFromS3(key)
            const loras = Array.isArray(canvas?.loras) ? canvas.loras : []
            const idx = loras.findIndex((l: any) => l.requestId === requestId)
            if (idx >= 0) {
              loras[idx] = { ...loras[idx], status: 'completed', artifactUrl, updatedAt: new Date().toISOString() }
              updated = loras[idx]
              await writeJsonAtKey(key, { ...canvas, loras, updatedAt: new Date().toISOString() })
            }
          } catch (e) {
            console.warn('Failed to update canvas loras in S3:', e)
          }
        }
      } catch (e) {
        console.warn('Failed to persist completed LoRA:', e)
      }
    }

    return NextResponse.json({ success: true, status: status?.status, logs: (status as any)?.logs, lora: updated })
  } catch (e: any) {
    console.error('[train-status] error:', e)
    return NextResponse.json({ error: e?.message || 'Status check failed' }, { status: 500 })
  }
}


