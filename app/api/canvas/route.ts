import { NextRequest, NextResponse } from 'next/server'
import { uploadJson } from '@/lib/s3-upload'

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

    const payload = {
      id: body?.id || `canvas-${Date.now()}`,
      name,
      note,
      items,
      createdAt: body?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const uploaded = await uploadJson(payload, { prefix: 'canvases', filenameBase: payload.id })
    return NextResponse.json({ success: true, canvas: payload, storage: uploaded })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save canvas' }, { status: 500 })
  }
}


