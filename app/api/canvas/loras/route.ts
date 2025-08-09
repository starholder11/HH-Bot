import { NextRequest, NextResponse } from 'next/server'
import { readJsonFromS3 } from '@/lib/s3-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function readCanvasById(id: string) {
  // Resolve key via index if present
  let key = `canvases/${id}.json`
  try {
    const index = await readJsonFromS3('canvases/index.json')
    const entry = (index?.items || []).find((it: any) => it.id === id)
    if (entry?.key) key = entry.key
  } catch {}
  return await readJsonFromS3(key)
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const name = url.searchParams.get('name')
    const all = url.searchParams.get('all')

    if (id || name) {
      // Resolve by id or by name via index
      let resolvedId = id || ''
      if (!resolvedId && name) {
        try {
          const index = await readJsonFromS3('canvases/index.json')
          const match = (index?.items || []).find((it: any) => (it.name || '').toLowerCase() === name.toLowerCase())
          if (match?.id) resolvedId = match.id
        } catch {}
      }
      if (!resolvedId) return NextResponse.json({ error: 'Canvas not found' }, { status: 404 })
      const canvas = await readCanvasById(resolvedId)
      const loras = Array.isArray(canvas?.loras) ? canvas.loras : []
      return NextResponse.json({ success: true, id: resolvedId, name: canvas?.name, loras })
    }

    if (all) {
      // Return summary of loras for all canvases
      let items: any[] = []
      try {
        const index = await readJsonFromS3('canvases/index.json')
        items = index?.items || []
      } catch {}
      const results: any[] = []
      for (const it of items) {
        try {
          const c = await readJsonFromS3(it.key)
          const loras = Array.isArray(c?.loras) ? c.loras : []
          if (loras.length > 0) {
            results.push({ id: c.id, name: c.name, loras: loras.map((l: any) => ({
              requestId: l.requestId,
              status: l.status,
              artifactUrl: l.artifactUrl,
              triggerWord: l.triggerWord,
              version: l.version,
            })) })
          }
        } catch {}
      }
      return NextResponse.json({ success: true, items: results })
    }

    return NextResponse.json({ error: 'Specify ?id= or ?name= or ?all=1' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to read loras' }, { status: 500 })
  }
}


