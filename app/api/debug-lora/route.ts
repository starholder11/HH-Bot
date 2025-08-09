import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { readJsonFromS3 } from '@/lib/s3-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const requestId = searchParams.get('requestId') || 'ae87878a-e25c-4552-ad8f-49632f7f62a0'
    const canvasId = searchParams.get('canvasId') || 'canvas-1754773074994'
    
    const apiKey = (process.env.FAL_KEY || '').trim()
    if (!apiKey) return NextResponse.json({ error: 'FAL_KEY not set' }, { status: 500 })
    fal.config({ credentials: apiKey })

    // Check FAL status
    const status = await fal.queue.status('fal-ai/flux-lora-fast-training', { requestId } as any)
    
    // Get FAL result
    let falResult = null
    let artifactUrl = null
    if (status?.status === 'COMPLETED') {
      try {
        falResult = await fal.queue.result('fal-ai/flux-lora-fast-training', { requestId } as any)
        artifactUrl = (falResult as any)?.diffusers_lora_file?.url || (falResult as any)?.safetensors_file?.url || (falResult as any)?.lora_file?.url
      } catch (e) {
        falResult = { error: e.message }
      }
    }
    
    // Check canvas data
    let key = `canvases/${canvasId}.json`
    try {
      const index = await readJsonFromS3('canvases/index.json')
      const entry = (index?.items || []).find((it: any) => it.id === canvasId)
      if (entry?.key) key = entry.key
    } catch {}
    
    const canvas = await readJsonFromS3(key)
    const loras = Array.isArray(canvas?.loras) ? canvas.loras : []
    const loraIndex = loras.findIndex((l: any) => l.requestId === requestId)
    const targetLora = loraIndex >= 0 ? loras[loraIndex] : null

    return NextResponse.json({
      requestId,
      canvasId,
      status: status?.status,
      falResult,
      artifactUrl,
      canvasKey: key,
      lorasCount: loras.length,
      loraIndex,
      targetLora,
      allRequestIds: loras.map(l => l.requestId)
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message, stack: e?.stack }, { status: 500 })
  }
}
