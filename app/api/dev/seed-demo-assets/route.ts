import { NextResponse } from 'next/server';
import { clearS3KeysCache, saveMediaAsset } from '@/lib/media-storage';

function nowIso() {
  return new Date().toISOString();
}

export async function GET() {
  try {
    const createdAt = nowIso();

    // Seed demo layout
    const layoutId = 'demo-layout';
    const layoutAsset: any = {
      id: layoutId,
      filename: `${layoutId}.json`,
      s3_url: `s3://seed/${layoutId}.json`,
      cloudflare_url: '',
      title: 'Demo Layout',
      description: 'Seeded demo layout for direct-insertion tests',
      media_type: 'layout',
      layout_type: 'blueprint_composer',
      metadata: {
        file_size: 0,
        width: 1440,
        height: 1024,
        cell_size: 8,
        item_count: 0,
        has_inline_content: false,
        has_transforms: false,
      },
      layout_data: {
        designSize: { width: 1440, height: 1024 },
        cellSize: 8,
        styling: {
          theme: 'dark',
          colors: { background: '#111217', text: '#ffffff' },
        },
        items: [],
      },
      ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
      manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
      processing_status: {
        upload: 'completed',
        metadata_extraction: 'completed',
        ai_labeling: 'not_started',
        manual_review: 'pending',
        html_generation: 'pending',
      },
      timestamps: { uploaded: createdAt, metadata_extracted: createdAt, labeled_ai: null, labeled_reviewed: null, html_generated: null },
      labeling_complete: false,
      project_id: null,
      created_at: createdAt,
      updated_at: createdAt,
    };

    // Seed demo space
    const spaceId = 'demo-space';
    const spaceAsset: any = {
      id: spaceId,
      filename: `${spaceId}.json`,
      s3_url: `s3://seed/${spaceId}.json`,
      cloudflare_url: '',
      title: 'Demo Space',
      description: 'Seeded demo space for direct-insertion tests',
      media_type: 'space',
      space_type: 'custom',
      metadata: { item_count: 0 },
      space: {
        environment: { backgroundColor: '#111217', lighting: 'studio' },
        camera: { position: [4, 3, 6], target: [0, 0, 0], fov: 50, controls: 'orbit' },
        items: [],
        relationships: [],
        zones: [],
      },
      ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
      manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
      processing_status: {
        upload: 'completed',
        metadata_extraction: 'completed',
        ai_labeling: 'not_started',
        manual_review: 'pending',
      },
      timestamps: { uploaded: createdAt, metadata_extracted: createdAt, labeled_ai: null, labeled_reviewed: null },
      labeling_complete: false,
      project_id: null,
      created_at: createdAt,
      updated_at: createdAt,
    };

    await saveMediaAsset(layoutId, layoutAsset);
    await saveMediaAsset(spaceId, spaceAsset);

    clearS3KeysCache();

    return NextResponse.json({ success: true, seeded: ['demo-layout', 'demo-space'] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Seed failed' }, { status: 500 });
  }
}


