import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset } from '@/lib/media-storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    console.log(`[media-assets] Fetching full metadata for asset: ${id}`);

    // Get the complete asset data from S3 JSON storage
    let asset = await getMediaAsset(id);
    
    // If not found as regular media asset, try as keyframe asset (for images that are keyframes)
    if (!asset) {
      try {
        const { getKeyframeAsset } = await import('@/lib/media-storage');
        const keyframeAsset = await getKeyframeAsset(id);
        if (keyframeAsset) {
          // Convert KeyframeStill to MediaAsset-like structure for consistency
          asset = {
            ...keyframeAsset,
            manual_labels: {
              scenes: [],
              objects: [],
              style: [],
              mood: [],
              themes: [],
              custom_tags: []
            },
            created_at: keyframeAsset.timestamps?.extracted || new Date().toISOString(),
            updated_at: keyframeAsset.timestamps?.labeled_reviewed || keyframeAsset.timestamps?.extracted || new Date().toISOString()
          } as any;
          console.log(`[media-assets] Found as keyframe asset: ${asset?.title}`);
        }
      } catch (err) {
        console.log(`[media-assets] Not found as keyframe asset either`);
      }
    }
    
    if (!asset) {
      console.log(`[media-assets] Asset ${id} not found in any storage`);
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    console.log(`[media-assets] Found asset: ${asset.title} (${asset.media_type})`);

    // Return the complete asset with all metadata, AI labels, manual labels, etc.
    return NextResponse.json({
      success: true,
      asset
    });

  } catch (error) {
    console.error('[media-assets] Error fetching asset:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch asset metadata',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}
