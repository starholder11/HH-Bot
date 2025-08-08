import { NextRequest, NextResponse } from 'next/server'
import { uploadImage, uploadFile } from '@/lib/s3-upload'

// Import-by-URL to route generated media through the existing finish-upload flows
// Body: { url: string, mediaType: 'image'|'audio'|'video', originalFilename?: string, projectId?: string, analyze?: boolean }
// Returns the downstream finish-upload response

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const arrayBuf = await res.arrayBuffer()
  return Buffer.from(arrayBuf)
}

export async function POST(req: NextRequest) {
  try {
    const { url, mediaType, originalFilename, projectId, analyze = true } = await req.json()
    if (!url || !mediaType) {
      return NextResponse.json({ error: 'url and mediaType are required' }, { status: 400 })
    }

    // 1) Download to buffer on server
    const buffer = await fetchAsBuffer(url)

    // 2) Upload to S3 using existing helpers
    let uploaded: { url: string; key: string; size: number; contentType: string }
    let filename = originalFilename || url.split('/').pop() || `${mediaType}`

    if (mediaType === 'image') {
      uploaded = await uploadImage(buffer, { format: 'jpeg', quality: 90 })
    } else if (mediaType === 'audio') {
      uploaded = await uploadFile(buffer, 'audio')
    } else if (mediaType === 'video') {
      uploaded = await uploadFile(buffer, 'videos')
    } else {
      return NextResponse.json({ error: `Unsupported mediaType: ${mediaType}` }, { status: 400 })
    }

    // 3) Call existing finish-upload route for the media type to create the asset, metadata, and trigger analysis
    const baseUrl = process.env.PUBLIC_API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    if (mediaType === 'image') {
      const resp = await fetch(`${baseUrl}/api/media-labeling/images/finish-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: uploaded.key, originalFilename: filename, projectId }),
      })
      const json = await resp.json()
      return NextResponse.json(json, { status: resp.status })
    }

    if (mediaType === 'video') {
      const resp = await fetch(`${baseUrl}/api/media-labeling/videos/finish-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: uploaded.key, originalFilename: filename, projectId }),
      })
      const json = await resp.json()
      return NextResponse.json(json, { status: resp.status })
    }

    if (mediaType === 'audio') {
      const resp = await fetch(`${baseUrl}/api/audio-labeling/finish-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: uploaded.key, originalFilename: filename }),
      })
      const json = await resp.json()
      return NextResponse.json(json, { status: resp.status })
    }

    return NextResponse.json({ error: 'Unsupported' }, { status: 400 })
  } catch (err: any) {
    console.error('[api/import/url] error:', err)
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 })
  }
}


