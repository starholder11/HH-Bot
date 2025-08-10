#!/usr/bin/env tsx

import './bootstrap-env'
import { listProjects, Project } from '../lib/project-storage'
import { getAssetsByProject } from '../lib/media-storage'
import { readJsonFromS3, writeJsonAtKey, listKeys } from '../lib/s3-upload'

type CanvasIndexEntry = { id: string; name: string; projectId?: string; key: string; updatedAt?: string }
type CanvasIndex = { items: CanvasIndexEntry[] }

async function loadCanvasIndex(): Promise<CanvasIndex> {
  try {
    const idx = await readJsonFromS3('canvases/index.json')
    return { items: Array.isArray(idx?.items) ? idx.items : [] }
  } catch {
    // Fallback: list all canvas JSONs and synthesize a basic index
    try {
      const keys = await listKeys('canvases/', 10000)
      const items: CanvasIndexEntry[] = []
      for (const key of keys) {
        if (!key.endsWith('.json') || key.endsWith('/index.json')) continue
        try {
          const c = await readJsonFromS3(key)
          if (c && c.id && c.name) {
            items.push({ id: c.id, name: c.name, projectId: c.projectId, key, updatedAt: c.updatedAt || c.createdAt })
          }
        } catch {}
      }
      return { items }
    } catch {
      return { items: [] }
    }
  }
}

function buildItemsFromAssets(assets: any[]): any[] {
  // Images + keyframes as image type
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

async function createCanvasForProject(project: Project, existingIndex: CanvasIndex): Promise<CanvasIndexEntry | null> {
  const nameLc = (project.name || '').trim().toLowerCase()
  const hasByName = existingIndex.items.some(it => (it.name || '').trim().toLowerCase() === nameLc)
  const hasByProject = existingIndex.items.some(it => (it.projectId || '') === project.project_id)
  if (hasByName || hasByProject) return null

  const assets = await getAssetsByProject(project.project_id)
  const items = buildItemsFromAssets(assets)

  const payload = {
    id: `canvas-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    name: project.name?.trim() || project.project_id,
    note: `Auto-created from project ${project.project_id}`,
    items,
    projectId: project.project_id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const key = `canvases/${payload.id}.json`
  await writeJsonAtKey(key, payload)

  // Update index
  const entry: CanvasIndexEntry = { id: payload.id, name: payload.name, projectId: payload.projectId, key, updatedAt: payload.updatedAt }
  const nextIndex = { items: [entry, ...existingIndex.items] }
  await writeJsonAtKey('canvases/index.json', nextIndex)
  return entry
}

async function main() {
  console.log('Scanning projects and canvases...')
  const [projects, index] = await Promise.all([listProjects(), loadCanvasIndex()])
  console.log(`Found ${projects.length} projects; ${index.items.length} canvases`)

  let created = 0
  for (const project of projects) {
    try {
      const res = await createCanvasForProject(project, index)
      if (res) {
        created++
        index.items.unshift(res)
        console.log(`Created canvas for project: ${project.name} → ${res.id}`)
      } else {
        // console.log(`Skipping project with existing canvas: ${project.name}`)
      }
    } catch (e) {
      console.error(`Failed to create canvas for project ${project.name} (${project.project_id})`, e)
    }
  }

  console.log(`Done. Created ${created} canvases.`)
}

main().catch(err => { console.error(err); process.exit(1) })


