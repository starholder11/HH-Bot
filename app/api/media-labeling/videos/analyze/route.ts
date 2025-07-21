import { NextResponse } from 'next/server';
import { getMediaAsset, saveMediaAsset, KeyframeStill, VideoAsset } from '@/lib/media-storage';
import { downloadFromS3, extractKeyframesFromVideo, ExtractedFrame } from '@/lib/video-processing';
import { performAiLabeling } from '@/lib/ai-labeling';
import { generateUUID } from '@/lib/utils';


function convertExtractedFrameToKeyframeStill(frame: ExtractedFrame, videoAsset: VideoAsset, index: number, strategy: string): KeyframeStill {
    const timestamp = frame.timestamp;
    const keyframeFilename = `${videoAsset.title}_keyframe_${String(index + 1).padStart(2, '0')}.jpg`;

    return {
        id: generateUUID(),
        parent_video_id: videoAsset.id,
        project_id: videoAsset.project_id,
        media_type: 'keyframe_still',
        timestamp: timestamp,
        frame_number: frame.frameNumber,
        filename: keyframeFilename,
        title: `${videoAsset.title} - Frame ${index + 1}`,
        s3_url: '', // Will be populated after upload
        cloudflare_url: '', // Will be populated after upload
        reusable_as_image: true,
        source_info: {
            video_filename: videoAsset.filename,
            timestamp: timestamp,
            frame_number: frame.frameNumber,
            extraction_method: strategy,
        },
        metadata: {
            file_size: frame.buffer.length,
            format: 'jpeg',
            resolution: { width: frame.width, height: frame.height },
            aspect_ratio: `${frame.width}:${frame.height}`,
            color_profile: 'sRGB',
            quality: 85,
        },
        ai_labels: undefined,
        usage_tracking: {
            times_reused: 0,
            projects_used_in: [],
            last_used: null,
        },
        processing_status: {
            extraction: 'completed',
            ai_labeling: 'pending',
            manual_review: 'pending',
        },
        timestamps: {
            extracted: new Date().toISOString(),
            labeled_ai: null,
            labeled_reviewed: null,
        },
        labeling_complete: false,
    };
}


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

    // NOTE: This route is now called by Lambda after it extracts keyframes with FFmpeg
    // The Lambda has already done the heavy lifting, so we just need to trigger AI labeling
    // if keyframes exist but haven't been AI labeled yet

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
      // No keyframes exist - this shouldn't happen if Lambda processed correctly
      console.error(`[analyze-route] No keyframes found for video ${assetId} - Lambda processing may have failed`);

      videoAsset.processing_status.keyframe_extraction = 'error';
      videoAsset.processing_status.ai_labeling = 'failed';
      await saveMediaAsset(assetId, videoAsset);

      return NextResponse.json({
        error: 'No keyframes available for analysis',
        message: 'Video processing may have failed during keyframe extraction'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[analyze-route] Error:', error);
    return NextResponse.json({ error: 'Video analysis failed' }, { status: 500 });
  }
}
