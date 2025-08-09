import { readJsonFromS3, writeJsonAtKey } from '../lib/s3-upload'
import { fal } from '@fal-ai/client'

const requestId = 'ae87878a-e25c-4552-ad8f-49632f7f62a0'
const canvasId = 'canvas-1754773074994'

async function fixLora() {
  try {
    // Configure FAL
    const apiKey = process.env.FAL_KEY?.trim()
    if (!apiKey) throw new Error('FAL_KEY not set')
    fal.config({ credentials: apiKey })

    // Get FAL result
    console.log('Getting FAL result...')
    const result = await fal.queue.result('fal-ai/flux-lora-fast-training', { requestId } as any)
    console.log('FAL result:', JSON.stringify(result, null, 2))

    // Extract artifact URL
    const artifactUrl = (result as any)?.diffusers_lora_file?.url || (result as any)?.safetensors_file?.url || (result as any)?.lora_file?.url
    console.log('Artifact URL:', artifactUrl)

    if (!artifactUrl) {
      throw new Error('No artifact URL found in FAL result')
    }

    // Read canvas
    let key = `canvases/${canvasId}.json`
    try {
      const index = await readJsonFromS3('canvases/index.json')
      const entry = (index?.items || []).find((it: any) => it.id === canvasId)
      if (entry?.key) key = entry.key
    } catch {}

    console.log('Reading canvas from:', key)
    const canvas = await readJsonFromS3(key)
    const loras = Array.isArray(canvas?.loras) ? canvas.loras : []
    console.log('Found loras:', loras.length)

    // Find and update the LoRA
    const idx = loras.findIndex((l: any) => l.requestId === requestId)
    console.log('LoRA index:', idx)

    if (idx >= 0) {
      loras[idx] = {
        ...loras[idx],
        status: 'completed',
        artifactUrl,
        path: artifactUrl,
        updatedAt: new Date().toISOString()
      }

      const updatedCanvas = { ...canvas, loras, updatedAt: new Date().toISOString() }
      await writeJsonAtKey(key, updatedCanvas)

      // Update index
      try {
        const index = await readJsonFromS3('canvases/index.json')
        const indexIdx = (index.items || []).findIndex((it: any) => it.id === canvasId)
        if (indexIdx >= 0) {
          index.items[indexIdx].updatedAt = updatedCanvas.updatedAt
          await writeJsonAtKey('canvases/index.json', index)
        }
      } catch {}

      console.log('Successfully updated LoRA:', loras[idx])
    } else {
      console.log('LoRA not found in canvas')
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

fixLora()
