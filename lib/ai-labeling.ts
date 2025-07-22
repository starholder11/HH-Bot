import OpenAI from 'openai';
import { getMediaAsset, MediaAsset, KeyframeStill, saveMediaAsset, updateMediaAsset } from '@/lib/media-storage';

function isImageAsset(asset: MediaAsset | KeyframeStill): asset is MediaAsset & { media_type: 'image' | 'keyframe_still' } {
    return asset.media_type === 'image' || asset.media_type === 'keyframe_still';
}

// IMPORTANT: Do NOT instantiate the OpenAI client at module scope. Doing so causes
// whatever value is present for `process.env.OPENAI_API_KEY` **at build time** to
// be permanently in-lined into the compiled serverless bundle. If the key is
// missing (e.g. running locally without secrets or mis-scoped in the Vercel
// dashboard) the placeholder string gets hard-coded and runtime overrides are
// ignored, resulting in 401 "your_ope************here" errors.

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes('your_ope')) {
    throw new Error('OPENAI_API_KEY environment variable is not set correctly at runtime');
  }
  return new OpenAI({ apiKey });
}

/**
 * Shared AI labeling function that can be called directly from any server context
 */
export async function performAiLabeling(assetId: string, force: boolean = false) {
  let asset: MediaAsset | KeyframeStill | null = null;
  try {
    // Lazily create the client so the *runtime* env var is picked up every time.
    const openai = getOpenAIClient();

    asset = await getMediaAsset(assetId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    if (!isImageAsset(asset)) {
      throw new Error(`Asset ${assetId} is not an image or keyframe, it's a ${asset.media_type}`);
    }

    console.log(`Starting AI labeling for image: ${asset.title} (force: ${force})`);

    // Check if already completed and not forcing re-analysis
    if (!force && asset.processing_status?.ai_labeling === 'completed') {
      console.log(`[ai-labeling] Asset ${assetId} already completed, skipping (use force=true to re-analyze)`);
      return {
        message: 'Asset already completed',
        stage: 'completed',
        assetId: asset.id,
        labels: asset.ai_labels
      };
    }

    // Set status to 'processing'
    asset.processing_status.ai_labeling = 'processing';
    await saveMediaAsset(asset.id, asset);

    // Use CloudFlare URL for better performance, fallback to S3
    const imageUrl = asset.cloudflare_url || asset.s3_url;

    // Call OpenAI Vision API with structured prompt
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image and provide detailed labels in the following categories. Respond with a JSON object that matches this exact structure:

{
  "scenes": ["array of scene descriptions - what's happening, the setting, environment"],
  "objects": ["array of specific objects, people, animals, items visible"],
  "style": ["array of visual style descriptors - photographic, artistic, cinematic, etc."],
  "mood": ["array of emotional qualities - cheerful, dramatic, serene, energetic, etc."],
  "themes": ["array of high-level conceptual themes - nature, technology, human connection, etc."],
  "confidence_scores": {
    "scenes": [0.0-1.0],
    "objects": [0.0-1.0],
    "style": [0.0-1.0],
    "mood": [0.0-1.0],
    "themes": [0.0-1.0]
  }
}

Be specific and descriptive. Include confidence scores for each category. Focus on what you can clearly observe in the image.`
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.3
    });

    const aiResponseText = response.choices[0]?.message?.content;
    if (!aiResponseText) {
      throw new Error('No response from OpenAI Vision API');
    }

    console.log('AI Response:', aiResponseText);

    // Clean the response (remove markdown code blocks if present)
    const cleanResponse = aiResponseText
      .replace(/^```json\s*/, '')  // Remove opening ```json
      .replace(/\s*```$/, '')      // Remove closing ```
      .trim();

    // Parse the JSON response
    let aiLabels;
    try {
      aiLabels = JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error(`Failed to parse AI response as JSON for asset ${assetId}:`, parseError, `Raw response: ${cleanResponse}`);
      // Fallback: extract labels from text response
      aiLabels = extractLabelsFromText(aiResponseText);
    }

    // Validate and clean the AI labels
    const cleanedLabels = {
      scenes: Array.isArray(aiLabels.scenes) ? aiLabels.scenes.slice(0, 10) : [],
      objects: Array.isArray(aiLabels.objects) ? aiLabels.objects.slice(0, 15) : [],
      style: Array.isArray(aiLabels.style) ? aiLabels.style.slice(0, 8) : [],
      mood: Array.isArray(aiLabels.mood) ? aiLabels.mood.slice(0, 8) : [],
      themes: Array.isArray(aiLabels.themes) ? aiLabels.themes.slice(0, 8) : [],
      confidence_scores: aiLabels.confidence_scores || {}
    };

    // Update the asset with AI labels
    asset.ai_labels = cleanedLabels;
    asset.processing_status.ai_labeling = 'completed';
    if (asset.timestamps) {
      asset.timestamps.labeled_ai = new Date().toISOString();
    }
    await saveMediaAsset(assetId, asset);

    // If this is a keyframe, also update the parent video
    if ((asset as any).media_type === 'keyframe_still') {
      try {
        const keyframeAsset = asset as any; // Type assertion for runtime handling
        if (keyframeAsset.parent_video_id) {
          const parentVideo = await getMediaAsset(keyframeAsset.parent_video_id);
          if (parentVideo && parentVideo.media_type === 'video') {
            const videoAsset = parentVideo as any; // Type assertion for runtime handling
            if (videoAsset.keyframe_stills) {
              // Update the keyframe in the parent video's keyframe_stills array
              const keyframeIndex = videoAsset.keyframe_stills.findIndex((kf: any) => kf.id === assetId);
              if (keyframeIndex !== -1) {
                videoAsset.keyframe_stills[keyframeIndex] = asset;

                // 🔑 Persist the in-memory change so subsequent reads see the updated status
                await updateMediaAsset(videoAsset.id, {
                  keyframe_stills: videoAsset.keyframe_stills,
                } as any);

                // Re-fetch parent video to get the very latest keyframe statuses – otherwise
                // we might operate on a stale snapshot (race condition when multiple frames
                // finish nearly simultaneously).
                const refreshedVideo = await getMediaAsset(videoAsset.id);
                if (!refreshedVideo) return;

                // LENIENT COMPLETION LOGIC: Consider video complete if 3/4+ keyframes are done
                const keyframes = ((refreshedVideo as any).keyframe_stills || []);
                const completedCount = keyframes.filter(
                  (kf: any) => kf.processing_status?.ai_labeling === 'completed'
                ).length;
                const failedCount = keyframes.filter(
                  (kf: any) => kf.processing_status?.ai_labeling === 'failed'
                ).length;
                const totalKeyframes = keyframes.length;

                // Calculate completion ratio and check if we should mark video as complete
                const completionRatio = totalKeyframes > 0 ? completedCount / totalKeyframes : 0;
                const minCompletionThreshold = 0.75; // 75% threshold

                const shouldMarkComplete = (
                  totalKeyframes > 0 &&
                  completionRatio >= minCompletionThreshold &&
                  ['pending', 'processing'].includes(refreshedVideo.processing_status?.ai_labeling || '')
                );

                console.log(`[ai-labeling] Video ${refreshedVideo.id} keyframe status: ${completedCount}/${totalKeyframes} completed (${Math.round(completionRatio * 100)}%), ${failedCount} failed. Threshold: ${Math.round(minCompletionThreshold * 100)}%`);

                if (shouldMarkComplete) {
                  console.log(`[ai-labeling] Marking video ${refreshedVideo.id} as COMPLETED due to lenient threshold.`);

                  // AGGREGATE KEYFRAME AI LABELS TO PARENT VIDEO
                  const completedKeyframes = keyframes.filter(
                    (kf: any) => kf.processing_status?.ai_labeling === 'completed' && kf.ai_labels
                  );

                  console.log(`[ai-labeling] Found ${completedKeyframes.length} keyframes with AI labels to aggregate`);

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
                    const videoTitle = (refreshedVideo as any).title || 'video';

                    // Generate a single cohesive description
                    aggregatedLabels.scenes = [await synthesizeVideoDescriptionWithAI(allScenes, videoTitle)];
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

                  await updateMediaAsset(refreshedVideo.id, {
                    processing_status: {
                      ...refreshedVideo.processing_status,
                      ai_labeling: 'completed',
                    },
                    ai_labels: aggregatedLabels,
                    labeling_complete: true,
                    timestamps: {
                      ...refreshedVideo.timestamps,
                      labeled_ai: new Date().toISOString(),
                    },
                  });
                } else if (videoAsset.processing_status.ai_labeling === 'processing' && completedCount + failedCount === totalKeyframes) {
                  // Check if we need to retry failed keyframes
                  const retryableKeyframes = keyframes.filter((kf: any) => {
                    const status = kf.processing_status?.ai_labeling;
                    const retryCount = kf.retry_count || 0;
                    return status === 'failed' && retryCount < 3; // Max 3 retries
                  });

                  if (retryableKeyframes.length > 0) {
                    console.log(`[ai-labeling] Found ${retryableKeyframes.length} keyframes eligible for retry`);

                    // Trigger retries for failed keyframes (async, don't block)
                    setTimeout(async () => {
                      for (const kf of retryableKeyframes) {
                        try {
                          const retryCount = (kf.retry_count || 0) + 1;
                          console.log(`[ai-labeling] Retrying keyframe ${kf.id} (attempt ${retryCount})`);

                          // Update retry count
                          await updateMediaAsset(kf.id, {
                            retry_count: retryCount,
                            processing_status: {
                              ...kf.processing_status,
                              ai_labeling: 'processing',
                            },
                          });

                          // Trigger retry
                          await performAiLabeling(kf.id);
                        } catch (retryError) {
                          console.error(`[ai-labeling] Retry failed for keyframe ${kf.id}:`, retryError);
                        }
                      }
                    }, 2000 * Math.random()); // Stagger retries to avoid overwhelming API
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Failed to update parent video:`, error);
        // Don't throw - the keyframe itself was successfully updated
      }
    }

    console.log(`AI labeling completed for image: ${asset.title}`);
    return { success: true, labels: cleanedLabels };

  } catch (error) {
    console.error(`OpenAI Vision API error for asset ${assetId}:`, error);
    if (asset) {
      // Update the asset to reflect the error
      asset.processing_status.ai_labeling = 'failed';
      await saveMediaAsset(assetId, asset);
    }
    throw error; // Re-throw to propagate the error
  }
}

/**
 * Fallback function to extract labels from a text response if JSON parsing fails.
 * This is a simple implementation and can be improved based on common failure patterns.
 */
function extractLabelsFromText(text: string) {
  const labels: any = {
    scenes: [],
    objects: [],
    style: [],
    mood: [],
    themes: [],
    confidence_scores: {}
  };

  // Simple keyword extraction for fallback
  const lowerText = text.toLowerCase();
  if (lowerText.includes('scene:')) {
    labels.scenes = lowerText.split('scene:')[1].split('\n')[0].trim().split(', ');
  }
  if (lowerText.includes('objects:')) {
    labels.objects = lowerText.split('objects:')[1].split('\n')[0].trim().split(', ');
  }
  if (lowerText.includes('style:')) {
    labels.style = lowerText.split('style:')[1].split('\n')[0].trim().split(', ');
  }
  if (lowerText.includes('mood:')) {
    labels.mood = lowerText.split('mood:')[1].split('\n')[0].trim().split(', ');
  }
  if (lowerText.includes('themes:')) {
    labels.themes = lowerText.split('themes:')[1].split('\n')[0].trim().split(', ');
  }

  return labels;
}

// Helper function to synthesize keyframe descriptions using OpenAI
async function synthesizeVideoDescriptionWithAI(keyframeDescriptions: string[], videoTitle: string): Promise<string> {
  try {
    const openai = getOpenAIClient();

    const prompt = `You are analyzing a video called "${videoTitle}" by looking at descriptions of ${keyframeDescriptions.length} keyframes extracted from the video.

Here are the individual keyframe descriptions in chronological order:
${keyframeDescriptions.map((desc, i) => `Frame ${i + 1}: ${desc}`).join('\n')}

Please create a single, cohesive description of the overall video that:
1. **Captures the temporal progression** - what changes between frames
2. **Describes the main action or movement** happening throughout the video
3. **Identifies scene transitions** or significant changes in setting/composition
4. **Summarizes the narrative flow** from beginning to end
5. **Highlights any character or object movement/interaction**
6. **Notes the overall pacing** (static, dynamic, gradual changes, etc.)

Focus on the STORY and ACTION rather than just listing what's visible. Describe what HAPPENS in the video, not just what IS in the video.

Respond with a single paragraph that tells the story of this video's progression.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.3
    });

    const synthesis = response.choices[0]?.message?.content?.trim();
    if (synthesis) {
      console.log(`[ai-labeling] Synthesized video description: ${synthesis}`);
      return synthesis;
    }

    // Fallback to first keyframe description if synthesis fails
    return keyframeDescriptions[0] || "Video content could not be analyzed.";

  } catch (error) {
    console.error(`[ai-labeling] Failed to synthesize video description:`, error);
    // Fallback to first keyframe description
    return keyframeDescriptions[0] || "Video content could not be analyzed.";
  }
}

// Helper function to extract common elements (simplified - mainly for fallback)
function extractCommonElements(scenes: string[]): { subjects: string[], settings: string[], actions: string[] } {
  // Simple keyword extraction for fallback
  const subjects = ['person', 'woman', 'man', 'people'];
  const settings = ['office', 'room', 'environment', 'setting'];
  const actions = ['sitting', 'typing', 'working', 'standing'];

  return { subjects, settings, actions };
}

// Fallback synthesis function (for when OpenAI call fails)
function synthesizeVideoDescriptionFallback(allScenes: string[]): string {
  if (allScenes.length === 0) return "Video content could not be analyzed.";
  if (allScenes.length === 1) return allScenes[0];

  // Simple fallback: return the longest description
  return allScenes.reduce((longest, current) =>
    current.length > longest.length ? current : longest
  );
}
