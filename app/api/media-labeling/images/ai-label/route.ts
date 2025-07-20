import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getMediaAsset, updateMediaAsset } from '@/lib/media-storage';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { assetId } = body;

    if (!assetId) {
      return NextResponse.json(
        { error: 'Asset ID is required' },
        { status: 400 }
      );
    }

    // Get the media asset
    const asset = await getMediaAsset(assetId);
    if (!asset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    if (asset.media_type !== 'image') {
      return NextResponse.json(
        { error: 'Asset is not an image' },
        { status: 400 }
      );
    }

    console.log(`Starting AI labeling for image: ${asset.title}`);

    // Use CloudFlare URL for better performance, fallback to S3
    const imageUrl = asset.cloudflare_url || asset.s3_url;

    try {
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

      // Parse the JSON response
      let aiLabels;
      try {
        aiLabels = JSON.parse(aiResponseText);
      } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', parseError);
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
      const updatedAsset = {
        ...asset,
        ai_labels: cleanedLabels,
        processing_status: {
          ...asset.processing_status,
          ai_labeling: 'completed' as const
        },
        updated_at: new Date().toISOString()
      };

      await updateMediaAsset(assetId, updatedAsset);

      console.log(`AI labeling completed for image: ${asset.title}`);
      console.log('Generated labels:', cleanedLabels);

      return NextResponse.json({
        success: true,
        labels: cleanedLabels,
        asset_id: assetId
      });

    } catch (aiError) {
      console.error('OpenAI Vision API error:', aiError);

      // Update asset with error status
      const errorAsset = {
        ...asset,
        processing_status: {
          ...asset.processing_status,
          ai_labeling: 'error' as const
        },
        updated_at: new Date().toISOString()
      };
      await updateMediaAsset(assetId, errorAsset);

      return NextResponse.json(
        {
          error: 'AI labeling failed',
          details: aiError instanceof Error ? aiError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('AI labeling error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Fallback function to extract labels from text response if JSON parsing fails
 */
function extractLabelsFromText(text: string) {
  const result = {
    scenes: [],
    objects: [],
    style: [],
    mood: [],
    themes: [],
    confidence_scores: {}
  };

  // Simple regex patterns to extract lists
  const patterns = {
    scenes: /scenes?[:\-\s]*\[([^\]]+)\]/i,
    objects: /objects?[:\-\s]*\[([^\]]+)\]/i,
    style: /style[:\-\s]*\[([^\]]+)\]/i,
    mood: /mood[:\-\s]*\[([^\]]+)\]/i,
    themes: /themes?[:\-\s]*\[([^\]]+)\]/i
  };

  for (const [category, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match && category in result) {
      (result as any)[category] = match[1]
        .split(',')
        .map(item => item.trim().replace(/['"]/g, ''))
        .filter(item => item.length > 0)
        .slice(0, 10);
    }
  }

  return result;
}
