import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, saveMediaAsset } from '@/lib/media-storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    console.log(`[fix-status] Checking video status for: ${videoId}`);

    const videoAsset = await getMediaAsset(videoId);
    if (!videoAsset || videoAsset.media_type !== 'video') {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    console.log(`[fix-status] Current video AI status: ${videoAsset.processing_status?.ai_labeling}`);

    if (!videoAsset.keyframe_stills || videoAsset.keyframe_stills.length === 0) {
      return NextResponse.json({ error: 'Video has no keyframes' }, { status: 400 });
    }

    // Check if all keyframes are completed
    const allKeyframesCompleted = videoAsset.keyframe_stills.every((kf: any) =>
      kf.processing_status?.ai_labeling === 'completed'
    );

    console.log(`[fix-status] All keyframes completed: ${allKeyframesCompleted}`);
    console.log(`[fix-status] Keyframe statuses:`, videoAsset.keyframe_stills.map(kf => kf.processing_status?.ai_labeling));

    if (allKeyframesCompleted && ['pending', 'processing'].includes(videoAsset.processing_status?.ai_labeling || '')) {
      console.log(`[fix-status] Updating video status to completed`);

      videoAsset.processing_status.ai_labeling = 'completed';
      videoAsset.timestamps = videoAsset.timestamps || {};
      videoAsset.timestamps.labeled_ai = new Date().toISOString();

      await saveMediaAsset(videoId, videoAsset);

      return NextResponse.json({
        success: true,
        message: 'Video status updated to completed',
        videoId,
        previousStatus: 'processing',
        newStatus: 'completed'
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Video status does not need updating',
        videoId,
        allKeyframesCompleted,
        currentStatus: videoAsset.processing_status?.ai_labeling,
        keyframeStatuses: videoAsset.keyframe_stills.map(kf => kf.processing_status?.ai_labeling)
      });
    }

  } catch (error) {
    console.error('[fix-status] Error:', error);
    return NextResponse.json({
      error: 'Failed to fix video status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
