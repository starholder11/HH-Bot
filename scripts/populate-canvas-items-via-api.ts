#!/usr/bin/env tsx

// Populate existing canvases with images+keyframes from their project

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error || `${res.status} ${res.statusText} for ${url}`)
  return j as T
}

async function fetchCanvasIndex(): Promise<Array<{ id: string; name: string; projectId?: string }>> {
  const idx = await fetchJSON<any>(`${BASE}/api/canvas`)
  return Array.isArray(idx?.items) ? idx.items : []
}

async function fetchCanvas(id: string): Promise<any> {
  const res = await fetch(`${BASE}/api/canvas?id=${encodeURIComponent(id)}`)
  const j = await res.json()
  if (!res.ok) throw new Error(j?.error || `Failed to load canvas ${id}`)
  return j.canvas
}

async function fetchProject(projectId: string): Promise<any | null> {
  try {
    const res = await fetch(`${BASE}/api/media-labeling/projects/${encodeURIComponent(projectId)}`)
    const j = await res.json()
    if (!res.ok) throw new Error(j?.error || `Failed to load project ${projectId}`)
    return j
  } catch {
    return null
  }
}

async function fetchAssetsByIds(ids: string[]): Promise<any[]> {
  const results: any[] = []
  const CONCURRENCY = 10
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const slice = ids.slice(i, i + CONCURRENCY)
    const batch = await Promise.all(slice.map(async (id) => {
      try {
        const res = await fetch(`${BASE}/api/media-labeling/assets/${encodeURIComponent(id)}`)
        const j = await res.json()
        if (res.ok) return j
      } catch {}
      return null
    }))
    batch.forEach(x => { if (x) results.push(x) })
  }
  return results
}

async function fetchProjectAssets(projectId: string): Promise<any[]> {
  const all: any[] = []
  let page = 1
  let hasMore = true
  const limit = 1000
  while (hasMore) {
    const qs = new URLSearchParams({ project: projectId, page: String(page), limit: String(limit) })
    const res = await fetchJSON<any>(`${BASE}/api/media-labeling/assets?${qs.toString()}`)
    const assets = Array.isArray(res?.assets) ? res.assets : []
    all.push(...assets)
    hasMore = Boolean(res?.hasMore) && assets.length > 0
    page += 1
    if (page > 50) break
  }

  // also add project keyframes
  try {
    const kfRes = await fetchJSON<any>(`${BASE}/api/media-labeling/keyframes/search?exclude_project=&min_quality=0`)
    const projectKeyframes = Array.isArray(kfRes?.keyframes) ? kfRes.keyframes.filter((k: any) => k.project_id === projectId) : []
    all.push(...projectKeyframes.map((kf: any) => ({
      ...kf,
      media_type: 'keyframe_still',
      s3_url: kf.s3_url,
      cloudflare_url: kf.cloudflare_url,
      filename: kf.filename,
      title: kf.title,
      project_id: kf.project_id,
      _keyframe_metadata: {
        parent_video_id: kf.parent_video_id,
        timestamp: kf.timestamp,
        frame_number: kf.frame_number,
        source_video: kf.source_info?.video_filename || kf.parent_video_id,
      },
      metadata: {
        width: kf.metadata?.resolution?.width,
        height: kf.metadata?.resolution?.height,
        aspect_ratio: kf.metadata?.aspect_ratio,
        format: kf.metadata?.format,
        file_size: kf.metadata?.file_size,
      }
    })))
  } catch {}

  return all
}

function buildItems(assets: any[]): any[] {
  const images = assets.filter(a => a && (a.media_type === 'image' || a.media_type === 'keyframe_still'))
  const width = 280
  const height = 220
  const gap = 16
  const cols = 6
  return images.map((a, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const x = col * (width + gap)
    const y = row * (height + gap)
    return {
      id: a.id,
      type: 'image',
      position: { x, y, w: width, h: height, z: idx + 1 },
      order: idx,
      metadata: {
        id: a.id,
        title: a.title || a.filename || a.id,
        filename: a.filename,
        cloudflare_url: a.cloudflare_url,
        s3_url: a.s3_url,
        media_type: a.media_type,
        project_id: a.project_id,
        ai_labels: a.ai_labels,
        manual_labels: a.manual_labels,
        metadata: a.metadata,
        _keyframe_metadata: a._keyframe_metadata,
      }
    }
  })
}

async function putCanvas(canvas: any): Promise<void> {
  const res = await fetch(`${BASE}/api/canvas`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(canvas) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error || `PUT failed (${res.status})`)
}

async function main() {
  console.log(`Using server: ${BASE}`)
  const index = await fetchCanvasIndex()
  let updated = 0
  for (const entry of index) {
    const c = await fetchCanvas(entry.id)
    const projectId = c.projectId || entry.projectId
    if (!projectId) continue
    const hasImages = Array.isArray(c.items) && c.items.some((it: any) => (it?.type || '').toLowerCase() === 'image')
    if (hasImages) continue
    // 0) Try pulling explicit asset IDs from the project doc
    let assets: any[] = []
    const project = await fetchProject(projectId)
    const projectAssetIds: string[] = Array.isArray(project?.media_assets) ? project.media_assets : []
    if (projectAssetIds.length > 0) {
      const fetched = await fetchAssetsByIds(projectAssetIds)
      assets = assets.concat(fetched)
    }

    // 1) Fallback: scan paged assets API and filter by project id
    if (!assets.some(a => a && (a.media_type === 'image' || a.media_type === 'keyframe_still'))) {
      const paged = await fetchProjectAssets(projectId)
      assets = assets.concat(paged)
    }

    // Fallback: if nothing assigned to the project, try searching by canvas name
    if (!assets.some(a => a && (a.media_type === 'image' || a.media_type === 'keyframe_still'))) {
      try {
        const q = encodeURIComponent(c.name || '')
        const res = await fetch(`${BASE}/api/media-labeling/assets?search=${q}&type=image&page=1&limit=1000`)
        const j = await res.json()
        if (res.ok && Array.isArray(j.assets)) assets = assets.concat(j.assets)
      } catch {}
      try {
        const kf = await fetchJSON<any>(`${BASE}/api/media-labeling/keyframes/search?q=${encodeURIComponent(c.name || '')}`)
        const keyframes = Array.isArray(kf?.keyframes) ? kf.keyframes : []
        assets = assets.concat(keyframes.map((kf: any) => ({
          ...kf,
          media_type: 'keyframe_still',
          s3_url: kf.s3_url,
          cloudflare_url: kf.cloudflare_url,
          filename: kf.filename,
          title: kf.title,
          project_id: kf.project_id,
          _keyframe_metadata: {
            parent_video_id: kf.parent_video_id,
            timestamp: kf.timestamp,
            frame_number: kf.frame_number,
            source_video: kf.source_info?.video_filename || kf.parent_video_id,
          },
          metadata: {
            width: kf.metadata?.resolution?.width,
            height: kf.metadata?.resolution?.height,
            aspect_ratio: kf.metadata?.aspect_ratio,
            format: kf.metadata?.format,
            file_size: kf.metadata?.file_size,
          }
        })))
      } catch {}
    }

    const items = buildItems(assets)
    const next = { ...c, items, updatedAt: new Date().toISOString() }
    await putCanvas(next)
    updated++
    console.log(`Populated ${c.name} (${c.id}) with ${items.length} items`)
  }
  console.log(`Done. Updated ${updated} canvases.`)
}

main().catch(err => { console.error(err); process.exit(1) })


