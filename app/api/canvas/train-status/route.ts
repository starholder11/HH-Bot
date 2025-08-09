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
        console.log(`[train-status] Fetching result for requestId: ${requestId}`)
        const res = await fal.queue.result('fal-ai/flux-lora-fast-training', { requestId } as any)
        console.log(`[train-status] FAL result:`, JSON.stringify(res, null, 2))
        
        const artifactUrl = (res as any)?.diffusers_lora_file?.url || (res as any)?.safetensors_file?.url || (res as any)?.lora_file?.url
        console.log(`[train-status] Extracted artifactUrl: ${artifactUrl}`)
        
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
            
            console.log(`[train-status] Reading canvas from key: ${key}`)
            const canvas = await readJsonFromS3(key)
            const loras = Array.isArray(canvas?.loras) ? canvas.loras : []
            console.log(`[train-status] Found ${loras.length} loras in canvas`)
            
            const idx = loras.findIndex((l: any) => l.requestId === requestId)
            console.log(`[train-status] LoRA index for requestId ${requestId}: ${idx}`)
            
            if (idx >= 0) {
              loras[idx] = { 
                ...loras[idx], 
                status: 'completed', 
                artifactUrl, 
                path: artifactUrl, 
                updatedAt: new Date().toISOString() 
              }
              updated = loras[idx]
              const updatedCanvas = { ...canvas, loras, updatedAt: new Date().toISOString() }
              
              console.log(`[train-status] Updating canvas with completed LoRA`)
              await writeJsonAtKey(key, updatedCanvas)
              
              // bump index timestamp
              try { 
                const index = await readJsonFromS3('canvases/index.json'); 
                const idx = (index.items || []).findIndex((it: any) => it.id === canvasId); 
                if (idx>=0){ 
                  index.items[idx].updatedAt = updatedCanvas.updatedAt; 
                  await writeJsonAtKey('canvases/index.json', index);
                } 
              } catch {}
              
              console.log(`[train-status] Successfully updated LoRA:`, updated)
            } else {
              console.warn(`[train-status] No LoRA found with requestId ${requestId}`)
            }
          } catch (e) {
            console.error('Failed to update canvas loras in S3:', e)
          }
        } else {
          console.warn(`[train-status] No artifact URL found in FAL result`)
        }
      } catch (e) {
        console.error('Failed to persist completed LoRA:', e)
      }
    }

    return NextResponse.json({ success: true, status: status?.status, logs: (status as any)?.logs, lora: updated })
  } catch (e: any) {
    console.error('[train-status] error:', e)
    return NextResponse.json({ error: e?.message || 'Status check failed' }, { status: 500 })
  }
}


