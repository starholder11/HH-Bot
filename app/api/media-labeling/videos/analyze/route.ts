import { NextResponse } from 'next/server';
import { getMediaAsset, saveMediaAsset, VideoAsset } from '@/lib/media-storage';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { assetId, strategy = 'adaptive', targetFrames, force = false } = body;

    if (!assetId) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    console.log(`[analyze-route] Video analysis request for: ${assetId} (force: ${force})`);

    const asset = await getMediaAsset(assetId);
    if (!asset || asset.media_type !== 'video') {
      return NextResponse.json({ error: 'Video asset not found' }, { status: 404 });
    }

    const videoAsset = asset as VideoAsset;

    console.log(`[analyze-route] Current video status:`, {
      keyframe_extraction: videoAsset.processing_status?.keyframe_extraction,
      ai_labeling: videoAsset.processing_status?.ai_labeling,
      keyframe_count: videoAsset.keyframe_count || 0,
      keyframes_present: videoAsset.keyframe_stills ? videoAsset.keyframe_stills.length : 0
    });

    // CASE 1: Video has keyframes - handle AI labeling
    if (videoAsset.keyframe_stills && videoAsset.keyframe_stills.length > 0) {
      console.log(`[analyze-route] Video has ${videoAsset.keyframe_stills.length} keyframes - checking AI labeling status`);

      // If force is true, re-analyze all keyframes regardless of their current status
      const keyframesToProcess = force
        ? videoAsset.keyframe_stills
        : videoAsset.keyframe_stills.filter(kf => kf.processing_status.ai_labeling === 'pending');

      if (keyframesToProcess.length > 0) {
        console.log(`[analyze-route] ${force ? 'Force re-analyzing' : 'Triggering AI labeling for'} ${keyframesToProcess.length} keyframes`);

        const baseUrl = process.env.PUBLIC_API_BASE_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

        // Trigger AI labeling for all target keyframes
        for (const keyframe of keyframesToProcess) {
          fetch(`${baseUrl}/api/media-labeling/images/ai-label`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetId: keyframe.id, force }),
          }).catch(err => console.error(`Failed to trigger AI labeling for keyframe ${keyframe.id}:`, err));
        }

        // Update video status
        videoAsset.processing_status.ai_labeling = 'processing';
        await saveMediaAsset(assetId, videoAsset);

        return NextResponse.json({
          message: force
            ? `Force re-analyzing ${keyframesToProcess.length} keyframes`
            : `AI labeling triggered for ${keyframesToProcess.length} keyframes`,
          keyframes: keyframesToProcess.length,
          stage: 'ai_labeling',
          force
        });
      } else {
        return NextResponse.json({
          message: 'All keyframes already processed',
          keyframes: videoAsset.keyframe_stills.length,
          stage: 'completed'
        });
      }
    }

    // CASE 2: Video has no keyframes - trigger initial keyframe extraction
    else {
      console.log(`[analyze-route] Video has no keyframes - triggering initial keyframe extraction`);

      // Update video status to indicate we're starting the process
      const updatedVideoAsset = {
        ...videoAsset,
        processing_status: {
          ...videoAsset.processing_status,
          keyframe_extraction: 'processing' as const,
          ai_labeling: 'pending' as const
        },
        updated_at: new Date().toISOString()
      };
      await saveMediaAsset(assetId, updatedVideoAsset);

      try {
        const baseUrl = process.env.PUBLIC_API_BASE_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

        // Prepare Lambda payload for keyframe extraction
        const lambdaPayload = {
          Records: [
            {
              body: JSON.stringify({
                assetId: assetId,
                mediaType: 'video',
                strategy: strategy,
                targetFrames: targetFrames,
                requestedAt: Date.now(),
              })
            }
          ]
        };

        console.log(`[analyze-route] Triggering Lambda keyframe extraction with payload:`, lambdaPayload);

        // Trigger Lambda function for keyframe extraction
        const lambdaResponse = await fetch(`${baseUrl}/api/video-processing/lambda`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lambdaPayload),
        });

        if (!lambdaResponse.ok) {
          const errorData = await lambdaResponse.json().catch(() => ({ error: `HTTP ${lambdaResponse.status}` }));
          throw new Error(`Lambda invocation failed: ${errorData.error || lambdaResponse.statusText}`);
        }

        const lambdaResult = await lambdaResponse.json();
        console.log(`[analyze-route] Lambda invocation successful:`, lambdaResult);

        return NextResponse.json({
          message: 'Keyframe extraction initiated successfully',
          stage: 'keyframe_extraction',
          lambdaResult: lambdaResult
        });

      } catch (error) {
        console.error(`[analyze-route] Failed to trigger keyframe extraction:`, error);

        // Update video status to reflect the error
        await saveMediaAsset(assetId, {
          ...updatedVideoAsset,
          processing_status: {
            ...updatedVideoAsset.processing_status,
            keyframe_extraction: 'error' as const,
            ai_labeling: 'failed' as const
          }
        });

        return NextResponse.json({
          error: 'Failed to initiate keyframe extraction',
          details: error instanceof Error ? error.message : String(error),
          stage: 'keyframe_extraction_failed'
        }, { status: 500 });
      }
    }

  } catch (error) {
    console.error('[analyze-route] Error:', error);
    return NextResponse.json({ error: 'Video analysis failed' }, { status: 500 });
  }
}
