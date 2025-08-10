#!/usr/bin/env tsx

// Create missing canvases by calling server APIs so server-side creds are used

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

type Project = { project_id: string; name: string }

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.json() as Promise<T>
}

async function fetchProjects(): Promise<Project[]> {
  const arr = await fetchJSON<Project[]>(`${BASE}/api/media-labeling/projects`)
  // Endpoint returns raw array per app/file-manager
  return arr
}

async function fetchCanvasIndex(): Promise<Array<{ id: string; name: string; projectId?: string }>> {
  const idx = await fetchJSON<any>(`${BASE}/api/canvas`)
  return Array.isArray(idx?.items) ? idx.items : []
}

async function fetchProjectAssets(projectId: string): Promise<any[]> {
  const all: any[] = []
  let page = 1
  let hasMore = true
  const limit = 1000
  // 1) fetch all media assets for the project (images/videos)
  while (hasMore) {
    const qs = new URLSearchParams({ project: projectId, page: String(page), limit: String(limit) })
    const res = await fetchJSON<any>(`${BASE}/api/media-labeling/assets?${qs.toString()}`)
    const assets = Array.isArray(res?.assets) ? res.assets : []
    all.push(...assets)
    hasMore = Boolean(res?.hasMore) && assets.length > 0
    page += 1
    if (page > 50) break // safety cap
  }

  // 2) also fetch reusable keyframes for this project
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

function buildItemsFromAssets(assets: any[]): any[] {
  const imageAssets = assets.filter(a => a && (a.media_type === 'image' || a.media_type === 'keyframe_still'))
  const width = 280
  const height = 220
  const gap = 16
  const cols = 6
  return imageAssets.map((a, idx) => {
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

async function saveCanvas(payload: any): Promise<void> {
  const res = await fetch(`${BASE}/api/canvas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error || `Save failed (${res.status})`)
}

async function main() {
  console.log(`Using server: ${BASE}`)
  const [projects, canvasIndex] = await Promise.all([fetchProjects(), fetchCanvasIndex()])
  console.log(`Projects: ${projects.length}, existing canvases: ${canvasIndex.length}`)

  let created = 0
  for (const p of projects) {
    const nameLc = (p.name || '').trim().toLowerCase()
    const exists = canvasIndex.some(c => (c.projectId && c.projectId === p.project_id) || ((c.name || '').trim().toLowerCase() === nameLc))
    if (exists) continue
    try {
      const assets = await fetchProjectAssets(p.project_id)
      const items = buildItemsFromAssets(assets)
      const id = `canvas-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
      const payload = { id, name: p.name?.trim() || p.project_id, note: `Auto-created from project ${p.project_id}`, projectId: p.project_id, items, createdAt: new Date().toISOString() }
      await saveCanvas(payload)
      created++
      console.log(`Created canvas for ${p.name} → ${id} (${items.length} items)`)
    } catch (e: any) {
      console.error(`Failed for ${p.name}:`, e?.message || e)
    }
  }
  console.log(`Done. Created ${created} canvases.`)
}

main().catch(err => { console.error(err); process.exit(1) })


