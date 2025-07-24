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
      const { assets: allVideos } = await listMediaAssets('video', { loadAll: true });
      const videoAssets = allVideos as VideoAsset[];
      videosToEvaluate = videoAssets.filter(video =>
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

          // Collect all keyframe data for synthesis
          const allScenes: string[] = [];
          const allObjects: string[] = [];
          const allStyles: string[] = [];
          const allMoods: string[] = [];
          const allThemes: string[] = [];
          const allConfidenceScores: Record<string, number[]> = {
            scenes: [],
            objects: [],
            style: [],
            mood: [],
            themes: []
          };

          completedKeyframes.forEach((kf: any) => {
            const labels = kf.ai_labels;
            if (labels) {
              if (labels.scenes) allScenes.push(...labels.scenes);
              if (labels.objects) allObjects.push(...labels.objects);
              if (labels.style) allStyles.push(...labels.style);
              if (labels.mood) allMoods.push(...labels.mood);
              if (labels.themes) allThemes.push(...labels.themes);

              // Collect confidence scores
              if (labels.confidence_scores) {
                if (labels.confidence_scores.scenes) allConfidenceScores.scenes.push(labels.confidence_scores.scenes);
                if (labels.confidence_scores.objects) allConfidenceScores.objects.push(labels.confidence_scores.objects);
                if (labels.confidence_scores.style) allConfidenceScores.style.push(labels.confidence_scores.style);
                if (labels.confidence_scores.mood) allConfidenceScores.mood.push(labels.confidence_scores.mood);
                if (labels.confidence_scores.themes) allConfidenceScores.themes.push(labels.confidence_scores.themes);
              }
            }
          });

          // CREATE UNIFIED VIDEO-LEVEL DESCRIPTION
          // Instead of listing all keyframe descriptions, synthesize a single overall description
          if (allScenes.length > 0) {
            // Analyze common elements across scenes to create unified description
            const commonElements = extractCommonElements(allScenes);
            const videoTitle = video.title || 'video';

            // Generate a single cohesive description
            aggregatedLabels.scenes = [synthesizeVideoDescription(allScenes, commonElements, videoTitle)];
          }

          // Deduplicate and limit other arrays
          aggregatedLabels.objects = Array.from(new Set(allObjects)).slice(0, 20);
          aggregatedLabels.style = Array.from(new Set(allStyles)).slice(0, 10);
          aggregatedLabels.mood = Array.from(new Set(allMoods)).slice(0, 10);
          aggregatedLabels.themes = Array.from(new Set(allThemes)).slice(0, 10);

          // Calculate average confidence scores (if available)
          aggregatedLabels.confidence_scores = {
            scenes: allConfidenceScores.scenes.length > 0 ? [allConfidenceScores.scenes.reduce((a, b) => a + b, 0) / allConfidenceScores.scenes.length] : [],
            objects: allConfidenceScores.objects.length > 0 ? [allConfidenceScores.objects.reduce((a, b) => a + b, 0) / allConfidenceScores.objects.length] : [],
            style: allConfidenceScores.style.length > 0 ? [allConfidenceScores.style.reduce((a, b) => a + b, 0) / allConfidenceScores.style.length] : [],
            mood: allConfidenceScores.mood.length > 0 ? [allConfidenceScores.mood.reduce((a, b) => a + b, 0) / allConfidenceScores.mood.length] : [],
            themes: allConfidenceScores.themes.length > 0 ? [allConfidenceScores.themes.reduce((a, b) => a + b, 0) / allConfidenceScores.themes.length] : []
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

// Helper function to extract common elements from scene descriptions
function extractCommonElements(scenes: string[]): { setting: string[], subjects: string[], actions: string[] } {
  const commonElements = {
    setting: [] as string[],
    subjects: [] as string[],
    actions: [] as string[]
  };

  // Simple keyword extraction for common elements
  const settingKeywords = ['office', 'desk', 'room', 'environment', 'setting', 'background', 'location'];
  const subjectKeywords = ['woman', 'man', 'person', 'people', 'character', 'individual'];
  const actionKeywords = ['sitting', 'typing', 'working', 'wearing', 'dressed', 'standing', 'moving'];

  scenes.forEach(scene => {
    const lowerScene = scene.toLowerCase();

    settingKeywords.forEach(keyword => {
      if (lowerScene.includes(keyword) && !commonElements.setting.includes(keyword)) {
        commonElements.setting.push(keyword);
      }
    });

    subjectKeywords.forEach(keyword => {
      if (lowerScene.includes(keyword) && !commonElements.subjects.includes(keyword)) {
        commonElements.subjects.push(keyword);
      }
    });

    actionKeywords.forEach(keyword => {
      if (lowerScene.includes(keyword) && !commonElements.actions.includes(keyword)) {
        commonElements.actions.push(keyword);
      }
    });
  });

  return commonElements;
}

// Helper function to synthesize a unified video description
function synthesizeVideoDescription(scenes: string[], commonElements: any, videoTitle: string): string {
  // If only one scene, return it as-is
  if (scenes.length === 1) {
    return scenes[0];
  }

  // For multiple scenes, create a unified description
  const firstScene = scenes[0];
  const hasCommonSubject = commonElements.subjects.length > 0;
  const hasCommonSetting = commonElements.setting.length > 0;
  const hasCommonActions = commonElements.actions.length > 0;

  // Try to extract the main subject and setting from the first scene
  let unifiedDescription = '';

  if (hasCommonSubject && hasCommonSetting) {
    // Extract key elements to create a cohesive description
    const subject = firstScene.match(/(A \w+|\w+ dressed|A person)/i)?.[0] || 'A person';
    const setting = commonElements.setting[0] || 'environment';
    const mainAction = commonElements.actions[0] || 'appears';

    unifiedDescription = `${subject} ${mainAction} in ${setting === 'office' ? 'an office' : 'a ' + setting} environment. `;

    // Add any consistent details that appear across keyframes
    if (firstScene.includes('tiara')) unifiedDescription += 'The person is wearing a tiara and ';
    if (firstScene.includes('vintage')) unifiedDescription += 'vintage-style clothing. ';
    if (firstScene.includes('typing')) unifiedDescription += 'They are engaged in typing or working at a computer. ';
    if (firstScene.includes('glass partitions') || firstScene.includes('background')) {
      unifiedDescription += 'The setting shows a busy workplace with other people visible in the background.';
    }
  } else {
    // Fallback: use the most descriptive scene
    unifiedDescription = scenes.reduce((longest, current) =>
      current.length > longest.length ? current : longest
    );
  }

  return unifiedDescription.trim();
}
