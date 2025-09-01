import { NextRequest, NextResponse } from 'next/server';
import { saveMediaAsset } from '@/lib/media-storage';
import { ObjectAssetZ } from '@/lib/spatial/schemas';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, originalFilename, projectId, s3Url, cloudflareUrl } = body;

    if (!key || !originalFilename) {
      return NextResponse.json({ error: 'key and originalFilename are required' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const ext = originalFilename.toLowerCase().substring(originalFilename.lastIndexOf('.'));
    const title = originalFilename.replace(ext, '');

    const publicUrl = cloudflareUrl || s3Url || key;

    const asset = {
      id,
      filename: originalFilename,
      s3_url: publicUrl,
      cloudflare_url: publicUrl,
      title,
      description: `${title} 3D model`,
      media_type: 'object' as const,
      metadata: {
        category: 'general',
        subcategory: 'model',
        style: 'default',
        tags: ['3d', 'model', ext.replace('.', '')],
        s3_key: key
      },
      object_type: 'atomic' as const,
      object: {
        modelUrl: publicUrl,
        boundingBox: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
        category: 'general',
        subcategory: 'model',
        style: 'default',
        tags: ['3d', 'model']
      },
      ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
      manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
      processing_status: { upload: 'completed', metadata_extraction: 'completed', ai_labeling: 'not_started', manual_review: 'pending' },
      timestamps: { uploaded: now, metadata_extracted: now, labeled_ai: null, labeled_reviewed: null },
      labeling_complete: false,
      project_id: projectId || null,
      created_at: now,
      updated_at: now
    };

    const validated = ObjectAssetZ.parse(asset);
    await saveMediaAsset(id, validated);

    return NextResponse.json({ success: true, asset: validated });
  } catch (error) {
    console.error('[objects/finish-upload] error', error);
    return NextResponse.json({ error: 'Failed to finalize upload' }, { status: 500 });
  }
}
