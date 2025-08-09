import { NextRequest, NextResponse } from 'next/server'
import { uploadJson, listKeys, readJsonFromS3, writeJsonAtKey, BUCKET_NAME } from '@/lib/s3-upload'
import { s3Client } from '@/lib/s3-upload'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Shape stored in S3
// {
//   id: string,
//   name: string,
//   note?: string,
//   items: Array<{ id: string; type: 'image'|'video'|'audio'|'text'; position?: { x:number; y:number; w?:number; h?:number; z?:number }; order?: number; metadata?: any }>,
//   createdAt: string,
//   updatedAt: string
// }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name: string = (body?.name || '').toString().trim() || 'Untitled Canvas'
    const note: string | undefined = typeof body?.note === 'string' ? body.note : undefined
    const items: any[] = Array.isArray(body?.items) ? body.items : []
    const projectId: string | undefined = typeof body?.projectId === 'string' ? body.projectId : undefined

    const payload = {
      id: body?.id || `canvas-${Date.now()}`,
      name,
      note,
      items,
      projectId,
      createdAt: body?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const key = `canvases/${payload.id}.json`
    const uploaded = await writeJsonAtKey(key, payload)

    // Update index
    try {
      const indexKey = 'canvases/index.json'
      let index: any = { items: [] as any[] }
      try { index = await readJsonFromS3(indexKey) } catch {}
      const entry = { id: payload.id, name: payload.name, projectId: payload.projectId, key: key, updatedAt: payload.updatedAt }
      const idx = (index.items || []).findIndex((x: any) => x.id === payload.id)
      if (idx >= 0) index.items[idx] = entry; else (index.items ||= []).unshift(entry)
      await writeJsonAtKey(indexKey, index)
    } catch {}

    return NextResponse.json({ success: true, canvas: payload, storage: uploaded })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save canvas' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  try {
    if (id) {
      // First get the index to find the actual key for this canvas ID
      try {
        const index = await readJsonFromS3('canvases/index.json')
        const canvasEntry = (index.items || []).find((item: any) => item.id === id)
        if (canvasEntry && canvasEntry.key) {
          const json = await readJsonFromS3(canvasEntry.key)
          return NextResponse.json({ success: true, canvas: json, key: canvasEntry.key })
        }
      } catch (e) {
        // If index fails, fall back to old method
        console.warn('Canvas index lookup failed, trying direct key:', e)
      }

      // Fallback to old method (direct key construction)
      const key = `canvases/${id}.json`
      const json = await readJsonFromS3(key)
      return NextResponse.json({ success: true, canvas: json, key })
    }
    // Prefer index
    try {
      const index = await readJsonFromS3('canvases/index.json')
      return NextResponse.json({ success: true, items: index.items || [] })
    } catch {}
    // Fallback to listing keys if index missing and permissions allow
    const keys = await listKeys('canvases/')
    const items = await Promise.all(keys.filter(k => k.endsWith('.json') && !k.endsWith('/index.json')).map(async (k) => {
      try { const c = await readJsonFromS3(k); return { key: k, id: c.id, name: c.name, updatedAt: c.updatedAt || c.createdAt } } catch { return { key: k } }
    }))
    return NextResponse.json({ success: true, items })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to list canvases' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const id: string = body?.id
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Get the actual key from the index
    let key = `canvases/${id}.json` // fallback
    try {
      const index = await readJsonFromS3('canvases/index.json')
      const canvasEntry = (index.items || []).find((item: any) => item.id === id)
      if (canvasEntry && canvasEntry.key) {
        key = canvasEntry.key
      }
    } catch (e) {
      console.warn('Canvas index lookup failed for PUT, using fallback key:', e)
    }

    // Read current to preserve items if not provided
    let current: any = {}
    try { current = await readJsonFromS3(key) } catch {}
    const updated = { ...current, ...body, updatedAt: new Date().toISOString() }
    const res = await writeJsonAtKey(key, updated)
    // Update index
    try {
      const indexKey = 'canvases/index.json'
      let index: any = { items: [] as any[] }
      try { index = await readJsonFromS3(indexKey) } catch {}
      const entry = { id: updated.id, name: updated.name, projectId: updated.projectId, key, updatedAt: updated.updatedAt }
      const idx = (index.items || []).findIndex((x: any) => x.id === updated.id)
      if (idx >= 0) index.items[idx] = entry; else (index.items ||= []).unshift(entry)
      await writeJsonAtKey(indexKey, index)
    } catch {}
    return NextResponse.json({ success: true, storage: res })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update canvas' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    // Get the actual key from the index
    let key = `canvases/${id}.json` // fallback
    try {
      const index = await readJsonFromS3('canvases/index.json')
      const canvasEntry = (index.items || []).find((item: any) => item.id === id)
      if (canvasEntry && canvasEntry.key) {
        key = canvasEntry.key
      }
    } catch (e) {
      console.warn('Canvas index lookup failed for DELETE, using fallback key:', e)
    }

    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
    // Update index
    try {
      const indexKey = 'canvases/index.json'
      let index: any = await readJsonFromS3(indexKey)
      index.items = (index.items || []).filter((x: any) => x.id !== id)
      await writeJsonAtKey(indexKey, index)
    } catch {}
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete canvas' }, { status: 500 })
  }
}


