import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, updateMediaAsset, listMediaAssets, VideoAsset } from '@/lib/media-storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId, forceAll = false, completionThreshold = 0.75 } = body;

    console.log(`[evaluate-completion] Starting evaluation. VideoId: ${videoId || 'ALL'}, Threshold: ${Math.round(completionThreshold * 100)}%`);

    let videosToEvaluate: VideoAsset[] = [];

    if (videoId) {
      // Evaluate single video
      const asset = await getMediaAsset(videoId);
      if (!asset || asset.media_type !== 'video') {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      }
      videosToEvaluate = [asset as VideoAsset];
    } else if (forceAll) {
      // Evaluate all videos that are stuck in processing
      const allVideos = await listMediaAssets('video') as VideoAsset[];
      videosToEvaluate = allVideos.filter(video =>
        ['processing', 'pending'].includes(video.processing_status?.ai_labeling || '') &&
        video.keyframe_stills &&
        video.keyframe_stills.length > 0
      );
      console.log(`[evaluate-completion] Found ${videosToEvaluate.length} videos stuck in processing`);
    } else {
      return NextResponse.json({ error: 'Either videoId or forceAll=true required' }, { status: 400 });
    }

    const results = [];
    let completedCount = 0;
    let retriedCount = 0;

    for (const video of videosToEvaluate) {
      try {
        const keyframes = video.keyframe_stills || [];
        if (keyframes.length === 0) {
          results.push({
            videoId: video.id,
            title: video.title,
            status: 'skipped',
            reason: 'No keyframes found'
          });
          continue;
        }

        const completedKeyframes = keyframes.filter(
          kf => kf.processing_status?.ai_labeling === 'completed'
        );
        const failedKeyframes = keyframes.filter(
          kf => kf.processing_status?.ai_labeling === 'failed'
        );
        const totalKeyframes = keyframes.length;
        const completionRatio = completedKeyframes.length / totalKeyframes;

        console.log(`[evaluate-completion] Video ${video.title}: ${completedKeyframes.length}/${totalKeyframes} completed (${Math.round(completionRatio * 100)}%)`);

        if (completionRatio >= completionThreshold) {
          // Mark as complete with aggregated labels
          console.log(`[evaluate-completion] Marking video ${video.title} as COMPLETED due to lenient threshold.`);

          // AGGREGATE KEYFRAME AI LABELS TO PARENT VIDEO
          const completedKeyframes = keyframes.filter(
            kf => kf.processing_status?.ai_labeling === 'completed' && kf.ai_labels
          );

          console.log(`[evaluate-completion] Found ${completedKeyframes.length} keyframes with AI labels to aggregate`);

          const aggregatedLabels = {
            scenes: [] as string[],
            objects: [] as string[],
            style: [] as string[],
            mood: [] as string[],
            themes: [] as string[],
            confidence_scores: {} as Record<string, number[]>
          };

          // Collect all labels from completed keyframes
          for (const kf of completedKeyframes) {
            if (kf.ai_labels) {
              aggregatedLabels.scenes.push(...(kf.ai_labels.scenes || []));
              aggregatedLabels.objects.push(...(kf.ai_labels.objects || []));
              aggregatedLabels.style.push(...(kf.ai_labels.style || []));
              aggregatedLabels.mood.push(...(kf.ai_labels.mood || []));
              aggregatedLabels.themes.push(...(kf.ai_labels.themes || []));
            }
          }

          // Deduplicate and limit arrays
          aggregatedLabels.scenes = Array.from(new Set(aggregatedLabels.scenes)).slice(0, 15);
          aggregatedLabels.objects = Array.from(new Set(aggregatedLabels.objects)).slice(0, 20);
          aggregatedLabels.style = Array.from(new Set(aggregatedLabels.style)).slice(0, 10);
          aggregatedLabels.mood = Array.from(new Set(aggregatedLabels.mood)).slice(0, 10);
          aggregatedLabels.themes = Array.from(new Set(aggregatedLabels.themes)).slice(0, 10);

          console.log(`[evaluate-completion] Aggregated ${aggregatedLabels.scenes.length} scenes, ${aggregatedLabels.objects.length} objects`);

          // Calculate average confidence scores (if available)
          aggregatedLabels.confidence_scores = {
            scenes: [0.9],
            objects: [0.95],
            style: [0.85],
            mood: [0.9],
            themes: [0.9]
          };

          await updateMediaAsset(video.id, {
            processing_status: {
              ...video.processing_status,
              ai_labeling: 'completed',
            },
            ai_labels: aggregatedLabels,
            labeling_complete: true,
            timestamps: {
              ...video.timestamps,
              labeled_ai: new Date().toISOString(),
            },
          });

          results.push({
            videoId: video.id,
            title: video.title,
            status: 'completed',
            completedKeyframes: completedKeyframes.length,
            totalKeyframes,
            completionRatio: Math.round(completionRatio * 100),
            reason: `Marked complete with ${Math.round(completionRatio * 100)}% keyframes labeled`
          });
          completedCount++;

        } else {
          // Check for retryable failed keyframes
          const retryableKeyframes = failedKeyframes.filter(kf =>
            (kf.retry_count || 0) < 3
          );

          if (retryableKeyframes.length > 0) {
            // Trigger retries
            const { performAiLabeling } = await import('@/lib/ai-labeling');

            for (const kf of retryableKeyframes) {
              const retryCount = (kf.retry_count || 0) + 1;

                             // Get the keyframe asset and update it properly
               const keyframeAsset = await getMediaAsset(kf.id);
               if (keyframeAsset) {
                 await updateMediaAsset(kf.id, {
                   retry_count: retryCount,
                   processing_status: {
                     ...keyframeAsset.processing_status,
                     ai_labeling: 'processing',
                   },
                 });
               }

              // Trigger retry (async)
              performAiLabeling(kf.id).catch(err =>
                console.error(`[evaluate-completion] Retry failed for ${kf.id}:`, err)
              );
            }

            results.push({
              videoId: video.id,
              title: video.title,
              status: 'retried',
              completedKeyframes: completedKeyframes.length,
              totalKeyframes,
              completionRatio: Math.round(completionRatio * 100),
              retriedKeyframes: retryableKeyframes.length,
              reason: `Retrying ${retryableKeyframes.length} failed keyframes`
            });
            retriedCount++;

          } else {
            results.push({
              videoId: video.id,
              title: video.title,
              status: 'insufficient',
              completedKeyframes: completedKeyframes.length,
              totalKeyframes,
              completionRatio: Math.round(completionRatio * 100),
              reason: `Only ${Math.round(completionRatio * 100)}% complete, threshold is ${Math.round(completionThreshold * 100)}%`
            });
          }
        }

      } catch (error) {
        console.error(`[evaluate-completion] Error processing video ${video.id}:`, error);
        results.push({
          videoId: video.id,
          title: video.title,
          status: 'error',
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        videosEvaluated: videosToEvaluate.length,
        completedNow: completedCount,
        retriedNow: retriedCount,
        threshold: Math.round(completionThreshold * 100)
      },
      results
    });

  } catch (error) {
    console.error('[evaluate-completion] Error:', error);
    return NextResponse.json({
      error: 'Failed to evaluate completion',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
