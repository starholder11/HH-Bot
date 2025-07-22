import { NextResponse } from 'next/server';
import { getMediaAsset, saveMediaAsset, VideoAsset } from '@/lib/media-storage';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { assetId, strategy = 'adaptive' } = body;

    if (!assetId) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    console.log(`[analyze-route] Video analysis request for: ${assetId}`);

    const asset = await getMediaAsset(assetId);
    if (!asset || asset.media_type !== 'video') {
      return NextResponse.json({ error: 'Video asset not found' }, { status: 404 });
    }

    const videoAsset = asset as VideoAsset;

    // This route is called by Lambda after keyframes are extracted
    // We should NEVER run local FFmpeg/FFprobe - only trigger AI labeling
    console.log(`[analyze-route] Current video status:`, {
      keyframe_extraction: videoAsset.processing_status.keyframe_extraction,
      ai_labeling: videoAsset.processing_status.ai_labeling,
      keyframe_count: videoAsset.keyframe_count || 0
    });

    if (videoAsset.keyframe_stills && videoAsset.keyframe_stills.length > 0) {
      // Keyframes already exist, trigger AI labeling if needed
      const pendingKeyframes = videoAsset.keyframe_stills.filter(kf =>
        kf.processing_status.ai_labeling === 'pending'
      );

      if (pendingKeyframes.length > 0) {
        console.log(`[analyze-route] Triggering AI labeling for ${pendingKeyframes.length} pending keyframes`);

        const baseUrl = process.env.PUBLIC_API_BASE_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

        // Trigger AI labeling for all pending keyframes
        for (const keyframe of pendingKeyframes) {
          fetch(`${baseUrl}/api/media-labeling/images/ai-label`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetId: keyframe.id }),
          }).catch(err => console.error(`Failed to trigger AI labeling for keyframe ${keyframe.id}:`, err));
        }

        // Update video status
        videoAsset.processing_status.ai_labeling = 'processing';
        await saveMediaAsset(assetId, videoAsset);

        return NextResponse.json({
          message: `AI labeling triggered for ${pendingKeyframes.length} keyframes`,
          keyframes: pendingKeyframes.length
        });
      } else {
        return NextResponse.json({
          message: 'All keyframes already processed',
          keyframes: videoAsset.keyframe_stills.length
        });
      }
    } else {
      // No keyframes exist - this means Lambda processing failed
      console.error(`[analyze-route] No keyframes found for video ${assetId} - Lambda processing failed`);

      videoAsset.processing_status.keyframe_extraction = 'error';
      videoAsset.processing_status.ai_labeling = 'failed';
      await saveMediaAsset(assetId, videoAsset);

      return NextResponse.json({
        error: 'No keyframes available for analysis',
        message: 'Video processing failed during keyframe extraction - keyframes must be extracted by Lambda first'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[analyze-route] Error:', error);
    return NextResponse.json({ error: 'Video analysis failed' }, { status: 500 });
  }
}
