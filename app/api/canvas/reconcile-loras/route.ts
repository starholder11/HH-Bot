import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { readJsonFromS3, writeJsonAtKey, listKeys } from '@/lib/s3-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getCanvasEntries(): Promise<Array<{ id: string; key: string }>> {
  try {
    const index: any = await readJsonFromS3('canvases/index.json')
    if (Array.isArray(index?.items)) {
      return index.items
        .filter((it: any) => it?.id && it?.key)
        .map((it: any) => ({ id: it.id, key: it.key }))
    }
  } catch {}
  const keys = await listKeys('canvases/', 5000)
  return keys
    .filter(k => k.endsWith('.json') && !k.endsWith('/index.json'))
    .map(k => ({ id: k.split('/').pop()!.replace('.json',''), key: k }))
}

async function reconcileCanvasLoras(entry: { id: string; key: string }) {
  try {
    const canvas = await readJsonFromS3(entry.key)
    if (!Array.isArray(canvas?.loras) || canvas.loras.length === 0) return { updated: false }

    let changed = false
    const loras = canvas.loras.map((l: any) => ({ ...l }))

    for (let i = 0; i < loras.length; i += 1) {
      const lora = loras[i]
      const requestId = lora?.requestId
      const status = (lora?.status || '').toString().toUpperCase()
      if (!requestId || status === 'COMPLETED') continue

      try {
        const q = await fal.queue.status('fal-ai/flux-lora-fast-training', { requestId } as any)
        const qStatus = (q?.status || '').toString().toUpperCase()
        if (qStatus === 'COMPLETED') {
          try {
            const res = await fal.queue.result('fal-ai/flux-lora-fast-training', { requestId } as any)
            const resultData: any = (res as any)?.data || res
            const artifactUrl = resultData?.diffusers_lora_file?.url ||
                                resultData?.safetensors_file?.url ||
                                resultData?.lora_file?.url ||
                                resultData?.diffusers_lora_file ||
                                resultData?.safetensors_file ||
                                resultData?.lora_file
            if (artifactUrl) {
              loras[i] = {
                ...loras[i],
                id: loras[i].id || loras[i].requestId,
                status: 'completed',
                artifactUrl,
                path: artifactUrl,
                updatedAt: new Date().toISOString(),
              }
              changed = true
            }
          } catch {}
        } else if (qStatus === 'FAILED' || qStatus === 'ERROR') {
          loras[i] = { ...loras[i], status: 'failed', updatedAt: new Date().toISOString() }
          changed = true
        }
      } catch {}
    }

    if (changed) {
      const updatedCanvas = { ...canvas, loras, updatedAt: new Date().toISOString() }
      await writeJsonAtKey(entry.key, updatedCanvas)
      // try to bump index timestamp
      try {
        const idx = await readJsonFromS3('canvases/index.json')
        if (Array.isArray(idx?.items)) {
          const pos = idx.items.findIndex((it: any) => it.id === entry.id)
          if (pos >= 0) {
            idx.items[pos].updatedAt = updatedCanvas.updatedAt
            await writeJsonAtKey('canvases/index.json', idx)
          }
        }
      } catch {}
      return { updated: true }
    }
    return { updated: false }
  } catch {
    return { updated: false }
  }
}

export async function GET(req: NextRequest) {
  try {
    const apiKey = (process.env.FAL_KEY || '').trim()
    if (!apiKey) return NextResponse.json({ error: 'FAL_KEY not set' }, { status: 500 })
    fal.config({ credentials: apiKey })

    const entries = await getCanvasEntries()

    // limit concurrency
    const concurrency = 5
    let idx = 0
    let updatedCount = 0
    const workers = Array.from({ length: concurrency }).map(async () => {
      while (idx < entries.length) {
        const my = entries[idx++]
        const res = await reconcileCanvasLoras(my)
        if (res.updated) updatedCount += 1
      }
    })
    await Promise.all(workers)

    return NextResponse.json({ success: true, canvasesChecked: entries.length, canvasesUpdated: updatedCount })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Reconcile failed' }, { status: 500 })
  }
}
