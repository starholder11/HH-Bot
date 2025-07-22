import OpenAI from 'openai';
import { getMediaAsset, MediaAsset, KeyframeStill, saveMediaAsset } from '@/lib/media-storage';

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
export async function performAiLabeling(assetId: string) {
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

    console.log(`Starting AI labeling for image: ${asset.title}`);

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

                // Check if all keyframes are now completed
                const allKeyframesCompleted = videoAsset.keyframe_stills.every((kf: any) =>
                  kf.processing_status?.ai_labeling === 'completed'
                );

                // Update parent video status if all keyframes are done
                if (allKeyframesCompleted && ['pending', 'processing'].includes(videoAsset.processing_status?.ai_labeling || '')) {
                  videoAsset.processing_status.ai_labeling = 'completed';
                  videoAsset.timestamps = videoAsset.timestamps || {};
                  videoAsset.timestamps.labeled_ai = new Date().toISOString();
                }

                await saveMediaAsset(keyframeAsset.parent_video_id, videoAsset);
                console.log(`Updated parent video ${keyframeAsset.parent_video_id} with completed keyframe`);
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
