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
  let assetId;
  try {
    const body = await request.json();
    assetId = body.assetId;
    const strategy = body.strategy || 'adaptive';

    if (!assetId) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    console.log(`Starting video analysis for: ${assetId}`);

    const asset = await getMediaAsset(assetId);
    if (!asset || asset.media_type !== 'video') {
      return NextResponse.json({ error: 'Video asset not found' }, { status: 404 });
    }
    const videoAsset = asset as VideoAsset;

    // Update status to 'processing'
    videoAsset.processing_status.keyframe_extraction = 'processing';
    await saveMediaAsset(assetId, videoAsset);


    const videoUrl = videoAsset.s3_url;
    if (!videoUrl) {
      return NextResponse.json({ error: 'Video S3 URL not found' }, { status: 404 });
    }

    const localPath = `/tmp/${assetId}.mp4`;
    await downloadFromS3(videoUrl, localPath);

    try {
      console.log(`Extracting keyframes using ${strategy} strategy`);
      const extractedFrames: ExtractedFrame[] = await extractKeyframesFromVideo(localPath, { strategy: strategy, targetFrames: 5 });
      const keyframes: KeyframeStill[] = extractedFrames.map((frame, index) => convertExtractedFrameToKeyframeStill(frame, videoAsset, index, strategy));

      console.log(`Extracted ${keyframes.length} keyframes`);

      // Save all keyframe assets first
      await Promise.all(keyframes.map(kf => saveMediaAsset(kf.id, kf as any)));
      console.log('All keyframe assets saved to DB.');

      if (keyframes.length > 0) {
        // Use the first keyframe as the video's hero image and get its AI labels
        try {
          console.log(`Performing AI labeling for video hero image: ${keyframes[0].id}`);
          const heroResult = await performAiLabeling(keyframes[0].id);
          videoAsset.ai_labels = heroResult.labels;
          videoAsset.processing_status.ai_labeling = 'completed';
          videoAsset.timestamps.labeled_ai = new Date().toISOString();
          await saveMediaAsset(assetId, videoAsset);

          console.log(`Hero image for video ${assetId} labeled successfully.`);
        } catch (heroLabelError) {
          console.error(`Failed to AI-label hero image for video ${assetId}:`, heroLabelError);
          videoAsset.processing_status.ai_labeling = 'failed';
          await saveMediaAsset(assetId, videoAsset);
        }

        // Asynchronously trigger AI labeling for the rest of the keyframes
        const otherKeyframes = keyframes.slice(1);
        if (otherKeyframes.length > 0) {
          const baseUrl = process.env.PUBLIC_API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
          console.log(`Asynchronously triggering AI labeling for ${otherKeyframes.length} other keyframes using base URL: ${baseUrl}`);

          for (const keyframe of otherKeyframes) {
            // No need to await these, let them run in the background
            fetch(`${baseUrl}/api/media-labeling/images/ai-label`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ assetId: keyframe.id }),
            }).catch(err => console.error(`Failed to trigger AI labeling for keyframe ${keyframe.id}`, err));
          }
        }
      }

      videoAsset.processing_status.keyframe_extraction = 'completed';
      videoAsset.timestamps.keyframes_extracted = new Date().toISOString();
      videoAsset.keyframe_count = keyframes.length;
      await saveMediaAsset(assetId, videoAsset);

    } finally {
      require('fs').unlink(localPath, (err: any) => {
        if (err) console.error(`Failed to clean up temp file ${localPath}:`, err);
      });
    }

    return NextResponse.json({ message: `Video analysis completed for: ${assetId}` });

  } catch (error) {
    console.error('Video analysis error:', error);
    if (assetId) {
      const asset = await getMediaAsset(assetId);
      if (asset && asset.media_type === 'video') {
        (asset as VideoAsset).processing_status.keyframe_extraction = 'error';
        await saveMediaAsset(assetId, asset);
      }
    }
    return NextResponse.json({ error: 'Video analysis failed' }, { status: 500 });
  }
}
