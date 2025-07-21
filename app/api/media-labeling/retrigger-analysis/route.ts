import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, saveMediaAsset } from '@/lib/media-storage';
import { enqueueAnalysisJob } from '@/lib/queue';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { assetId } = body;

    if (!assetId) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    console.log(`[retrigger-analysis] Retriggering analysis for: ${assetId}`);

    // Get the asset to make sure it exists
    const asset = await getMediaAsset(assetId);
    if (!asset || asset.media_type !== 'video') {
      return NextResponse.json({ error: 'Video asset not found' }, { status: 404 });
    }

    console.log(`[retrigger-analysis] Found video: ${asset.title}`);

    // Re-enqueue the analysis job
    try {
      await enqueueAnalysisJob({
        assetId: assetId,
        mediaType: 'video',
        strategy: 'adaptive',
        requestedAt: Date.now(),
      });

      // Update video status to indicate job queued
      await saveMediaAsset(assetId, {
        ...asset,
        processing_status: {
          ...asset.processing_status,
          ai_labeling: 'triggering',
        },
        updated_at: new Date().toISOString(),
      });

      console.log(`[retrigger-analysis] Successfully retriggered analysis for: ${assetId}`);

      return NextResponse.json({
        success: true,
        message: `Analysis retriggered for video: ${asset.title}`,
        assetId: assetId
      });

    } catch (error) {
      console.error(`[retrigger-analysis] Failed to enqueue job:`, error);

      // Update status to failed
      await saveMediaAsset(assetId, {
        ...asset,
        processing_status: {
          ...asset.processing_status,
          ai_labeling: 'failed',
        },
        updated_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: false,
        error: 'Failed to enqueue analysis job',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[retrigger-analysis] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrigger analysis' },
      { status: 500 }
    );
  }
}
