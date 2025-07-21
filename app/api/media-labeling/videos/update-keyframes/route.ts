import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, saveMediaAsset } from '@/lib/media-storage';
import { VideoAsset, KeyframeStill } from '@/lib/media-storage';
import { generateUUID } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { assetId, keyframeAssets } = body;

    if (!assetId || !keyframeAssets) {
      return NextResponse.json({ error: 'Missing assetId or keyframeAssets' }, { status: 400 });
    }

    console.log(`[update-keyframes] Updating video ${assetId} with ${keyframeAssets.length} keyframes`);

    // Get the video asset
    const asset = await getMediaAsset(assetId);
    if (!asset || asset.media_type !== 'video') {
      return NextResponse.json({ error: 'Video asset not found' }, { status: 404 });
    }

    const videoAsset = asset as VideoAsset;

    // Create keyframe still assets
    const keyframes: KeyframeStill[] = keyframeAssets.map((kf: any) => ({
      id: generateUUID(),
      parent_video_id: assetId,
      project_id: videoAsset.project_id,
      media_type: 'keyframe_still' as const,
      timestamp: kf.timestamp,
      frame_number: kf.frameNumber,
      filename: kf.filename,
      title: `${videoAsset.title} - Frame ${kf.index + 1}`,
      s3_url: kf.s3Url,
      cloudflare_url: kf.cloudflareUrl,
      reusable_as_image: true,
      source_info: {
        video_filename: videoAsset.filename,
        timestamp: kf.timestamp,
        frame_number: kf.frameNumber,
        extraction_method: 'lambda_adaptive',
      },
      metadata: {
        file_size: 0, // Will be updated when we get actual file size
        format: 'jpeg',
        resolution: { width: 1024, height: 1024 }, // Default, will be updated
        aspect_ratio: '1:1',
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
    }));

    // Save all keyframe assets
    await Promise.all(keyframes.map(kf => saveMediaAsset(kf.id, kf as any)));
    console.log(`[update-keyframes] Saved ${keyframes.length} keyframe assets`);

    // Update video asset with keyframes and completed status
    const updatedVideoAsset = {
      ...videoAsset,
      keyframe_stills: keyframes,
      keyframe_count: keyframes.length,
      processing_status: {
        ...videoAsset.processing_status,
        keyframe_extraction: 'completed' as const,
        ai_labeling: 'pending' as const, // Will be updated when hero frame is labeled
      },
      timestamps: {
        ...videoAsset.timestamps,
        keyframes_extracted: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    await saveMediaAsset(assetId, updatedVideoAsset);

    // Trigger AI labeling for the hero keyframe (first one)
    if (keyframes.length > 0) {
      const heroKeyframe = keyframes[0];

      try {
        console.log(`[update-keyframes] Triggering AI labeling for hero keyframe: ${heroKeyframe.id}`);

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';

        const labelResponse = await fetch(`${baseUrl}/api/media-labeling/images/ai-label`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: heroKeyframe.id }),
        });

        if (labelResponse.ok) {
          console.log(`[update-keyframes] Hero keyframe AI labeling triggered successfully`);

                     // Also update video's AI labeling status
           await saveMediaAsset(assetId, {
             ...updatedVideoAsset,
             processing_status: {
               ...updatedVideoAsset.processing_status,
               ai_labeling: 'processing' as const,
             },
           });
        } else {
          console.error(`[update-keyframes] Failed to trigger hero keyframe AI labeling: ${labelResponse.status}`);
        }
      } catch (labelError) {
        console.error(`[update-keyframes] Error triggering hero keyframe AI labeling:`, labelError);
      }

             // Trigger AI labeling for remaining keyframes asynchronously
       const otherKeyframes = keyframes.slice(1);
       if (otherKeyframes.length > 0) {
         console.log(`[update-keyframes] Triggering AI labeling for ${otherKeyframes.length} remaining keyframes`);

         const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';

         for (const keyframe of otherKeyframes) {
           fetch(`${baseUrl}/api/media-labeling/images/ai-label`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ assetId: keyframe.id }),
           }).catch(err => console.error(`Failed to trigger AI labeling for keyframe ${keyframe.id}:`, err));
         }
       }
    }

    console.log(`[update-keyframes] Successfully updated video ${assetId} with keyframes and triggered AI labeling`);

    return NextResponse.json({
      success: true,
      videoId: assetId,
      keyframesCreated: keyframes.length,
      aiLabelingTriggered: keyframes.length > 0
    });

  } catch (error) {
    console.error('[update-keyframes] Error updating video with keyframes:', error);
    return NextResponse.json(
      { error: 'Failed to update video with keyframes' },
      { status: 500 }
    );
  }
}
