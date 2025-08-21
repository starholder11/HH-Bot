import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets, saveMediaAsset } from '@/lib/media-storage';
import { SpaceAssetZ } from '@/lib/spatial/schemas';

export async function GET(req: NextRequest) {
  try {
    const result = await listMediaAssets('space' as any, { loadAll: true });
    return NextResponse.json({ assets: result.assets, totalCount: result.totalCount });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to list spaces' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Generate a valid minimal Space asset on the server
    const id = `space_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const asset = {
      id,
      filename: `${id}.json`,
      title: body?.title || 'Untitled Space',
      description: body?.description || '',
      projectId: body?.projectId || undefined,
      media_type: 'space' as const,
      space_type: body?.space_type || 'custom',
      space: {
        environment: {
          backgroundColor: '#111217',
          lighting: 'studio'
        },
        camera: {
          position: [4, 3, 6] as [number, number, number],
          target: [0, 0, 0] as [number, number, number],
          fov: 50,
          controls: 'orbit'
        },
        items: [] as any[]
      },
      s3_url: '',
      cloudflare_url: '',
      ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
      manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
      processing_status: {},
      timestamps: {},
      created_at: now,
      updated_at: now,
      version: 1
    };

    const parsed = SpaceAssetZ.parse(asset);
    await saveMediaAsset(parsed.id, parsed as any);
    return NextResponse.json(parsed);
  } catch (e: any) {
    const msg = e?.issues ? JSON.stringify(e.issues) : e?.message || 'Validation error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}


