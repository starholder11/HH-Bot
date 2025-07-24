import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, saveMediaAsset } from '@/lib/media-storage';
import { VideoAsset, KeyframeStill } from '@/lib/media-storage';
import { generateUUID } from '@/lib/utils';

// -----------------------------------------------------------------------------
// Helper: POST to /images/ai-label with retry.  Declared at module scope so it
// doesn’t violate ES5 strict-mode restrictions (no function declarations inside
// blocks) and can be reused by any route logic.
// -----------------------------------------------------------------------------

const BASE_AI_LABEL_URL = (process.env.PUBLIC_API_BASE_URL ?? 'https://hh-bot-lyart.vercel.app') + '/api/media-labeling/images/ai-label';

async function postAiLabel(assetId: string, attempt = 1): Promise<void> {
  const res = await fetch(BASE_AI_LABEL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId })
  });

  if (!res.ok) {
    if (attempt < 3) {
      const wait = 500 * attempt * attempt; // 0.5s, 2s, 4.5s
      console.warn(`[ai-retry] keyframe ${assetId} failed (${res.status}). retry ${attempt}/3 in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      return postAiLabel(assetId, attempt + 1);
    }
    throw new Error(`ai-label ${assetId} failed after 3 attempts (${res.status})`);
  }
}

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

    // 🔑 DEDUPLICATION: Check if keyframes already exist for this video
    if (videoAsset.keyframe_stills && videoAsset.keyframe_stills.length > 0) {
      console.log(`[update-keyframes] Video ${assetId} already has ${videoAsset.keyframe_stills.length} keyframes. Skipping duplicate creation.`);

      // Check if we need to trigger AI labeling for existing keyframes that haven't been processed
      const unprocessedKeyframes = videoAsset.keyframe_stills.filter(
        kf => kf.processing_status?.ai_labeling === 'pending' || !kf.processing_status?.ai_labeling
      );

      if (unprocessedKeyframes.length > 0) {
        console.log(`[update-keyframes] Found ${unprocessedKeyframes.length} existing keyframes that need AI labeling`);

        // Trigger AI labeling for unprocessed keyframes
        for (const kf of unprocessedKeyframes) {
          try {
            await postAiLabel(kf.id);
            console.log(`[update-keyframes] ✅ Triggered AI labeling for existing keyframe ${kf.id}`);
          } catch (error) {
            console.error(`[update-keyframes] ❌ Failed to trigger AI labeling for existing keyframe ${kf.id}:`, error);
          }
        }
      }

      return NextResponse.json({
        success: true,
        videoId: assetId,
        keyframesCreated: 0,
        existingKeyframes: videoAsset.keyframe_stills.length,
        message: 'Keyframes already exist, skipped duplicate creation'
      });
    }

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
      keyframes_present: true, // THIS IS THE MISSING FLAG!
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

    // Trigger AI labeling for all keyframes with proper retry logic and staggered timing
    if (keyframes.length > 0) {
      try {
        console.log(`[update-keyframes] Triggering AI labeling for ${keyframes.length} keyframes with staggered timing`);

        // Mark video AI-labeling as in-progress immediately
        await saveMediaAsset(assetId, {
          ...updatedVideoAsset,
          processing_status: {
            ...updatedVideoAsset.processing_status,
            ai_labeling: 'processing' as const,
          },
        });

        // Trigger AI labeling for all keyframes sequentially with delays to avoid rate limiting
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < keyframes.length; i++) {
          const kf = keyframes[i];
          const isHero = i === 0;

          try {
            // Add staggered delay to avoid overwhelming OpenAI API when processing multiple videos
            if (i > 0) {
              const delay = 1000 + (Math.random() * 1000); // 1-2 second delay between keyframes
              console.log(`[update-keyframes] Waiting ${Math.round(delay)}ms before triggering keyframe ${i + 1}/${keyframes.length}`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }

            console.log(`[update-keyframes] Triggering AI labeling for keyframe ${i + 1}/${keyframes.length} (${isHero ? 'hero' : 'standard'}): ${kf.id}`);

            await postAiLabel(kf.id);
            successCount++;

            console.log(`[update-keyframes] ✅ Keyframe ${i + 1} AI labeling triggered successfully`);

          } catch (labelError) {
            failureCount++;
            console.error(`[update-keyframes] ❌ Failed to trigger AI labeling for keyframe ${i + 1}: ${kf.id}`, labelError);

            // For critical failures, we don't want to stop the entire process
            // The lenient completion logic will handle partial failures
          }
        }

        console.log(`[update-keyframes] AI labeling trigger summary: ${successCount}/${keyframes.length} successful, ${failureCount} failed`);

        // If more than 50% of keyframes failed to trigger, mark video as failed
        if (failureCount > keyframes.length / 2) {
          console.error(`[update-keyframes] Too many AI labeling failures (${failureCount}/${keyframes.length}), marking video as failed`);
          await saveMediaAsset(assetId, {
            ...updatedVideoAsset,
            processing_status: {
              ...updatedVideoAsset.processing_status,
              ai_labeling: 'failed' as const,
            },
          });
        }

      } catch (overallError) {
        console.error(`[update-keyframes] Overall error in AI labeling trigger process:`, overallError);
        await saveMediaAsset(assetId, {
          ...updatedVideoAsset,
          processing_status: {
            ...updatedVideoAsset.processing_status,
            ai_labeling: 'failed' as const,
          },
        });
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
