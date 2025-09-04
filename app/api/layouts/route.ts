import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets, saveMediaAsset } from '@/lib/media-storage';
import { readJsonFromS3 } from '@/lib/s3-upload';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log('[layouts] Fetching layout assets...');

    let layouts: any[] = [];

    // Try fast path first: use layouts index for instant results
    try {
      const idx = await readJsonFromS3('layouts/index.json');
        if (idx && Array.isArray(idx.items) && idx.items.length) {
          // Fetch by IDs listed in index
          const s3 = getS3Client();
          const bucket = getBucketName();
          const ids = idx.items.map((i: any) => i.id);
          const fetched: any[] = [];
          for (const id of ids) {
            try {
              const key = `${process.env.MEDIA_DATA_PREFIX || 'media-labeling/assets/'}${id}.json`;
              const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
              if (obj.Body) {
                const text = await (obj.Body as any).transformToString?.() || '';
                if (text) fetched.push(JSON.parse(text));
              }
            } catch {}
          }
          layouts = fetched.filter(a => a.media_type === 'layout');
        }
    } catch (error) {
      console.log('[layouts] Index not found, falling back to S3 scan...');
    }

    // If fast path failed, fall back to slower S3 scan (paginated)
    if (!layouts.length) {
      console.log('[layouts] Using S3 scan fallback...');
      const result = await listMediaAssets('layout', { page: 1, limit: 100 });
      layouts = result.assets;
    }

    console.log(`[layouts] Returning ${layouts.length} layout assets`);

    return NextResponse.json({
      success: true,
      layouts,
      total: layouts.length
    });

  } catch (error) {
    console.error('[layouts] Error fetching layouts:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch layouts',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title = 'Untitled Layout',
      description = '',
      layout_data = {
        cellSize: 20,
        designSize: { width: 1200, height: 800 },
        items: [] as any[]
      },
      layout_type = 'blueprint_composer',
      metadata: incomingMeta
    } = body || {};

    const id = `layout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    const width = layout_data?.designSize?.width || 1200;
    const height = layout_data?.designSize?.height || 800;
    const itemCount = Array.isArray(layout_data?.items) ? layout_data.items.length : 0;

    const asset = {
      id,
      filename: `${id}.json`,
      s3_url: '',
      cloudflare_url: '',
      title,
      description,
      media_type: 'layout' as const,
      layout_type,
      metadata: {
        file_size: 0,
        width,
        height,
        cell_size: layout_data?.cellSize || 20,
        item_count: itemCount,
        has_inline_content: false,
        has_transforms: true,
        ...(incomingMeta || {})
      },
      layout_data,
      ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
      manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
      processing_status: { upload: 'completed', metadata_extraction: 'completed', ai_labeling: 'not_started', manual_review: 'pending', html_generation: 'pending' },
      timestamps: { uploaded: nowIso, metadata_extracted: nowIso, labeled_ai: null, labeled_reviewed: null, html_generated: null },
      labeling_complete: false,
      project_id: null,
      created_at: nowIso,
      updated_at: nowIso
    } as any;

    await saveMediaAsset(id, asset);

    return NextResponse.json({ success: true, id, asset });
  } catch (error) {
    console.error('[layouts] Error creating layout:', error);
    return NextResponse.json({ success: false, error: 'Failed to create layout' }, { status: 500 });
  }
}
