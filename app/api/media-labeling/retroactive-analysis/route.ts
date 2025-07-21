import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets, VideoAsset, KeyframeStill } from '@/lib/media-storage';

export async function POST(request: NextRequest) {
  try {
    console.log('[retroactive-analysis] Starting retroactive analysis for videos with pending keyframes...');

    // Get all video assets
    const allVideos = await listMediaAssets('video') as VideoAsset[];
    console.log(`[retroactive-analysis] Found ${allVideos.length} total videos`);

    // Filter videos that have:
    // 1. Completed video-level AI labeling
    // 2. Any keyframes with pending AI labeling
    const videosNeedingRetroactiveAnalysis = allVideos.filter((video: VideoAsset) => {
      // Must have completed video-level AI labeling
      if (video.processing_status?.ai_labeling !== 'completed') {
        return false;
      }

      // Must have keyframes
      if (!video.keyframe_stills || video.keyframe_stills.length === 0) {
        return false;
      }

      // Must have at least one keyframe with pending AI labeling
      const pendingKeyframes = video.keyframe_stills.filter(
        (keyframe: KeyframeStill) => keyframe.processing_status?.ai_labeling === 'pending'
      );

      return pendingKeyframes.length > 0;
    });

    console.log(`[retroactive-analysis] Found ${videosNeedingRetroactiveAnalysis.length} videos needing keyframe analysis`);

    if (videosNeedingRetroactiveAnalysis.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No videos need retroactive keyframe analysis',
        videosProcessed: 0
      });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each video
    for (const video of videosNeedingRetroactiveAnalysis) {
      try {
        console.log(`[retroactive-analysis] Processing video: ${video.title} (${video.id})`);

        const pendingKeyframes = video.keyframe_stills?.filter(
          (keyframe: KeyframeStill) => keyframe.processing_status?.ai_labeling === 'pending'
        ) || [];

        // Trigger AI labeling for each pending keyframe
        for (const keyframe of pendingKeyframes) {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

            const labelResponse = await fetch(`${baseUrl}/api/media-labeling/images/ai-label`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                assetId: keyframe.id
              }),
            });

            if (!labelResponse.ok) {
              console.error(`[retroactive-analysis] Failed to trigger AI labeling for keyframe ${keyframe.id}: ${labelResponse.status}`);
            } else {
              console.log(`[retroactive-analysis] Successfully triggered AI labeling for keyframe ${keyframe.id}`);
            }
          } catch (error) {
            console.error(`[retroactive-analysis] Error triggering AI labeling for keyframe ${keyframe.id}:`, error);
          }
        }

        results.push({
          videoId: video.id,
          title: video.title,
          pendingKeyframes: pendingKeyframes.length,
          status: 'triggered'
        });

        successCount++;
      } catch (error) {
        console.error(`[retroactive-analysis] Error processing video ${video.id}:`, error);
        results.push({
          videoId: video.id,
          title: video.title,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        errorCount++;
      }
    }

    console.log(`[retroactive-analysis] Completed. Success: ${successCount}, Errors: ${errorCount}`);

    return NextResponse.json({
      success: true,
      message: `Retroactive keyframe analysis triggered for ${successCount} videos`,
      videosProcessed: successCount,
      errors: errorCount,
      results: results
    });

  } catch (error) {
    console.error('[retroactive-analysis] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}
