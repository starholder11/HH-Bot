import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getVideoAsset, updateVideoAsset, saveKeyframeAsset, VideoAsset, KeyframeStill } from '@/lib/media-storage';
import { extractKeyframesFromVideo, extractKeyframesWithSmartDefaults, downloadFromS3, uploadKeyframeToS3, ExtractedFrame } from '@/lib/video-processing';
import { generateUUID } from '@/lib/utils';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AnalysisRequest {
  videoId: string;
  analysisType?: 'comprehensive' | 'style_focus' | 'mood_themes';
  keyframeStrategy?: 'adaptive' | 'uniform' | 'scene_change';
  targetFrames?: number;
}

// ExtractedFrame interface is imported from video-processing module

export async function POST(request: NextRequest) {
  try {
    const {
      videoId,
      analysisType = "comprehensive",
      keyframeStrategy = "adaptive",
      targetFrames = 5
    }: AnalysisRequest = await request.json();

    console.log(`Starting video analysis for: ${videoId}`);

    // 1. Get video asset from storage
    const videoAsset = await getVideoAsset(videoId);
    if (!videoAsset) {
      return NextResponse.json(
        { success: false, error: 'Video not found' },
        { status: 404 }
      );
    }

    // Check if we're in production (Vercel) and should use Lambda
    console.log('Environment check:', {
      VERCEL_ENV: process.env.VERCEL_ENV,
      NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL
    });

    const isProduction = process.env.VERCEL_ENV === 'production' ||
                        process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
                        process.env.NODE_ENV === 'production' ||
                        process.env.VERCEL === '1'; // Vercel always sets this

    if (isProduction) {
      console.log('Production environment detected, using Lambda for video analysis');

      // Forward to Lambda API route
      const lambdaUrl = new URL('/api/video-processing/lambda', request.nextUrl.origin);
      const lambdaResponse = await fetch(lambdaUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bucketName: 'hh-bot-images-2025-prod',
          videoKey: videoAsset.s3_url.split('/').slice(-2).join('/'), // Extract key from S3 URL
          action: 'extract_keyframes'
        })
      });

      if (!lambdaResponse.ok) {
        console.error('Lambda request failed:', await lambdaResponse.text());
        return NextResponse.json(
          { success: false, error: 'Lambda video processing failed' },
          { status: 500 }
        );
      }

      const lambdaResult = await lambdaResponse.json();
      console.log('Lambda processing result:', lambdaResult);

      // If Lambda succeeded, continue with GPT-4V analysis using keyframe URLs
      if (lambdaResult.success && lambdaResult.lambdaResult?.keyframes) {
        const keyframeUrls = lambdaResult.lambdaResult.keyframes.map((kf: any) => kf.s3_url);

        // Run GPT-4V analysis on the keyframes
        const gptAnalysis = await analyzeKeyframesWithGPT4V(keyframeUrls, analysisType);

        if (gptAnalysis.success) {
          // Update video asset with analysis results
          await updateVideoAsset(videoId, {
            ai_labels: gptAnalysis.videoLevelLabels,
            processing_status: {
              ...videoAsset.processing_status,
              ai_labeling: 'completed'
            },
            timestamps: {
              ...videoAsset.timestamps,
              labeled_ai: new Date().toISOString()
            },
            labeling_complete: true
          });

          return NextResponse.json({
            success: true,
            message: 'Video analysis completed successfully via Lambda',
            videoId,
            keyframesCount: keyframeUrls.length,
            analysis: gptAnalysis.videoLevelLabels,
            processingTime: gptAnalysis.processingTime,
            tokensUsed: gptAnalysis.tokensUsed
          });
        }
      }

      return NextResponse.json(
        { success: false, error: 'Lambda processing or GPT-4V analysis failed' },
        { status: 500 }
      );
    }

    // Local development - use FFmpeg directly

    // 2. Download video from S3 for processing
    const tempVideoPath = `/tmp/${videoId}.mp4`;
    await downloadFromS3(videoAsset.s3_url, tempVideoPath);

    // 3. Extract keyframes using selected strategy
    console.log(`Extracting keyframes using ${keyframeStrategy} strategy`);
    // 3. Extract keyframes using smart defaults or specified strategy
    const keyframes = keyframeStrategy === 'adaptive' && !targetFrames
      ? await extractKeyframesWithSmartDefaults(tempVideoPath)
      : await extractKeyframesFromVideo(tempVideoPath, {
          strategy: keyframeStrategy,
          targetFrames,
          maxSize: { width: 1024, height: 1024 },
          sceneThreshold: 0.3,
          skipSimilarFrames: true,
          qualityThreshold: 70
        });

    console.log(`Extracted ${keyframes.length} keyframes`);

    // 4. Upload keyframes as separate S3 assets and create keyframe records
    const keyframeAssets = await Promise.all(
      keyframes.map(async (frame: ExtractedFrame, index: number) => {
        const keyframeFilename = `${videoAsset.title}_keyframe_${String(index + 1).padStart(2, '0')}.jpg`;
        const s3Key = `keyframes/${videoId}/${keyframeFilename}`;

        // Upload to S3
        const s3Url = await uploadKeyframeToS3(frame.buffer, s3Key);
        const cloudflareUrl = s3Url.replace(
          'hh-bot-images-2025-prod.s3.amazonaws.com',
          'drbs5yklwtho3.cloudfront.net'
        );

        return {
          id: generateUUID(),
          parent_video_id: videoId,
          project_id: videoAsset.project_id,
          media_type: 'keyframe_still' as const,
          timestamp: frame.timestamp,
          frame_number: frame.frameNumber,
          filename: keyframeFilename,
          title: `${videoAsset.title} - Frame ${index + 1}`,
          s3_url: s3Url,
          cloudflare_url: cloudflareUrl,
          reusable_as_image: true,
          source_info: {
            video_filename: videoAsset.filename,
            timestamp: frame.timestamp,
            frame_number: frame.frameNumber,
            extraction_method: keyframeStrategy
          },
          metadata: {
            file_size: frame.buffer.length,
            format: 'jpeg',
            resolution: { width: frame.width, height: frame.height },
            aspect_ratio: calculateAspectRatio(frame.width, frame.height),
            color_profile: 'sRGB',
            quality: 85
          },
          ai_labels: undefined,
          usage_tracking: {
            times_reused: 0,
            projects_used_in: [],
            last_used: null
          },
          processing_status: {
            extraction: 'completed',
            ai_labeling: 'pending',
            manual_review: 'pending'
          },
          timestamps: {
            extracted: new Date().toISOString(),
            labeled_ai: null,
            labeled_reviewed: null
          },
          labeling_complete: false
        } as KeyframeStill;
      })
    );

    // 5. Analyze keyframes with GPT-4V
    console.log('Starting GPT-4V analysis of keyframes');
    const analysisResult = await analyzeKeyframesWithGPT4V(keyframes, analysisType);

    if (!analysisResult.success) {
      throw new Error(`GPT-4V analysis failed: ${analysisResult.error}`);
    }

    // 6. Add AI labels to keyframe assets
    keyframeAssets.forEach((keyframe: KeyframeStill, index: number) => {
      if (analysisResult.keyframeLevelLabels && analysisResult.keyframeLevelLabels[index]) {
        keyframe.ai_labels = analysisResult.keyframeLevelLabels[index];
        keyframe.processing_status.ai_labeling = 'completed';
        keyframe.timestamps.labeled_ai = new Date().toISOString();
      }
    });

    // 7. Save keyframe assets to storage
    await Promise.all(
      keyframeAssets.map(async (keyframe: KeyframeStill) => {
        await saveKeyframeAsset(keyframe);
      })
    );

    // 8. Update video asset with keyframe relationships and analysis
    const updatedVideoAsset = await updateVideoAsset(videoId, {
      keyframe_stills: keyframeAssets,
      keyframe_count: keyframeAssets.length,
              ai_labels: {
          scenes: analysisResult.videoLevelLabels?.scenes || [],
          objects: analysisResult.videoLevelLabels?.objects || [],
          style: analysisResult.videoLevelLabels?.style || [],
          mood: analysisResult.videoLevelLabels?.mood || [],
          themes: analysisResult.videoLevelLabels?.themes || [],
          confidence_scores: analysisResult.videoLevelLabels?.confidence_scores || {},
          overall_analysis: analysisResult.videoLevelLabels,
          keyframe_analysis: analysisResult.keyframeLevelLabels || [],
          analysis_metadata: {
            provider: 'gpt-4v',
            model: analysisResult.model || 'gpt-4o',
            analysis_type: analysisType,
            tokens_used: analysisResult.tokensUsed || 0,
            confidence_average: calculateAverageConfidence(analysisResult.videoLevelLabels),
            processing_time_ms: analysisResult.processingTime
          }
        },
      processing_status: {
        ...videoAsset.processing_status,
        ai_labeling: 'completed',
        keyframe_extraction: 'completed'
      },
      timestamps: {
        ...videoAsset.timestamps,
        keyframes_extracted: new Date().toISOString(),
        labeled_ai: new Date().toISOString()
      }
    });

    // 9. Clean up temporary file
    try {
      const fs = require('fs');
      fs.unlinkSync(tempVideoPath);
    } catch (err) {
      console.warn('Failed to clean up temp file:', err);
    }

    console.log(`Video analysis completed for: ${videoId}`);

    return NextResponse.json({
      success: true,
      video_analysis: analysisResult.videoLevelLabels,
      keyframes: keyframeAssets,
      analysis_metadata: {
        provider: 'gpt-4v',
        tokens_used: analysisResult.tokensUsed,
        processing_time: analysisResult.processingTime,
        keyframes_extracted: keyframes.length
      }
    });

  } catch (error) {
    console.error('Video analysis error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

async function analyzeKeyframesWithGPT4V(keyframes: ExtractedFrame[], analysisType: string) {
  const analysisPrompts = {
    comprehensive: `
    Analyze these video keyframes and provide detailed creative analysis focusing on:

    **VISUAL STYLE & AESTHETICS:**
    - Art style and visual approach (realistic, stylized, abstract, photographic, etc.)
    - Color palette and mood creation
    - Lighting design and atmosphere
    - Composition and visual flow
    - Texture and rendering quality

    **MOOD & EMOTIONAL TONE:**
    - Primary emotional atmosphere
    - Mood descriptors (dark, whimsical, epic, intimate, contemplative, etc.)
    - Psychological impact and viewer response
    - Atmospheric qualities (mysterious, bright, gritty, dreamlike)

    **CREATIVE THEMES & CONTENT:**
    - Central themes and concepts
    - Subject matter and setting
    - Narrative elements and storytelling
    - Cultural or genre influences
    - Symbolic or metaphorical content

    **TECHNICAL EXECUTION:**
    - Production quality indicators
    - Visual effects and techniques
    - Artistic craftsmanship level
    - Composition and framing quality

    Respond with a JSON object containing arrays for each category with specific descriptive values.
    Also provide individual frame analysis for each keyframe with the same structure.
    `,

    style_focus: `
    Focus specifically on artistic and visual style analysis:
    - Art movement or style influences
    - Rendering technique and approach
    - Color theory and palette usage
    - Visual aesthetics and design language
    - Stylistic consistency across frames

    Provide JSON response with detailed style categorization for overall video and each frame.
    `,

    mood_themes: `
    Analyze mood, themes, and narrative elements:
    - Emotional tone and atmosphere
    - Thematic content and concepts
    - Genre and storytelling elements
    - Symbolic meaning and interpretation
    - Audience and content positioning

    Return JSON with comprehensive mood and theme analysis for video and individual frames.
    `
  };

  // Encode keyframes to base64
  const encodedFrames = keyframes.map(frame => ({
    timestamp: frame.timestamp,
    data: frame.buffer.toString('base64')
  }));

  // Prepare message content
  const messageContent = [
    // Add all keyframe images first
    ...encodedFrames.map((frame, index) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${frame.data}`,
        detail: "high" as const
      }
    })),
    // Add analysis prompt
    {
      type: "text" as const,
      text: analysisPrompts[analysisType as keyof typeof analysisPrompts] || analysisPrompts.comprehensive
    }
  ];

  const startTime = Date.now();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Latest GPT-4 with vision
      messages: [
        {
          role: "user",
          content: messageContent
        }
      ],
      max_tokens: 3000,
      temperature: 0.1
    });

    const processingTime = Date.now() - startTime;
    const analysisText = response.choices[0].message.content;
    const parsedAnalysis = parseGPT4VResponse(analysisText || '');

    return {
      success: true,
      videoLevelLabels: parsedAnalysis.videoLevel,
      keyframeLevelLabels: parsedAnalysis.keyframeLevel,
      rawAnalysis: analysisText,
      tokensUsed: response.usage?.total_tokens,
      model: response.model,
      processingTime
    };

  } catch (error) {
    console.error('GPT-4V API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'GPT-4V analysis failed'
    };
  }
}

function parseGPT4VResponse(responseText: string) {
  console.log('[parseGPT4VResponse] Raw response length:', responseText.length);
  console.log('[parseGPT4VResponse] First 500 chars:', responseText.substring(0, 500));

  try {
    // First try: Look for JSON block
    let jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/i);
    if (!jsonMatch) {
      // Second try: Look for any code block
      jsonMatch = responseText.match(/```\s*([\s\S]*?)\s*```/);
    }
    if (!jsonMatch) {
      // Third try: Look for any JSON object
      jsonMatch = responseText.match(/\{[\s\S]*\}/);
    }

    if (jsonMatch) {
      const jsonText = jsonMatch[1] || jsonMatch[0];
      console.log('[parseGPT4VResponse] Extracted JSON text:', jsonText.substring(0, 300));

      const parsed = JSON.parse(jsonText);
      console.log('[parseGPT4VResponse] Successfully parsed JSON:', Object.keys(parsed));

      // Extract data with simple mapping
      const videoLevel = {
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
        objects: Array.isArray(parsed.objects) ? parsed.objects : [],
        style: Array.isArray(parsed.style) ? parsed.style : [],
        mood: Array.isArray(parsed.mood) ? parsed.mood : [],
        themes: Array.isArray(parsed.themes) ? parsed.themes : [],
        technical_quality: Array.isArray(parsed.technical_quality) ? parsed.technical_quality : [],
        confidence_scores: typeof parsed.confidence_scores === 'object' ? parsed.confidence_scores : {}
      };

      console.log('[parseGPT4VResponse] Extracted video level data:', videoLevel);

      return {
        videoLevel,
        keyframeLevel: Array.isArray(parsed.keyframe_analysis) ? parsed.keyframe_analysis : []
      };
    }
  } catch (error) {
    console.warn('[parseGPT4VResponse] JSON parsing failed:', error);
    console.log('[parseGPT4VResponse] Failed on text:', responseText.substring(0, 1000));
  }

  // Simple fallback - extract basic info from text
  console.log('[parseGPT4VResponse] Using simple text extraction fallback');

  const scenes: string[] = [];
  const objects: string[] = [];
  const style: string[] = [];
  const mood: string[] = [];
  const themes: string[] = [];

  // Look for common descriptive words
  const text = responseText.toLowerCase();

  if (text.includes('dramatic')) mood.push('dramatic');
  if (text.includes('cinematic')) style.push('cinematic');
  if (text.includes('photographic')) style.push('photographic');
  if (text.includes('realistic')) style.push('realistic');
  if (text.includes('artistic')) style.push('artistic');

  if (text.includes('nature')) themes.push('nature');
  if (text.includes('urban')) themes.push('urban');
  if (text.includes('human')) themes.push('human');

  return {
    videoLevel: {
      scenes,
      objects,
      style,
      mood,
      themes,
      technical_quality: [],
      confidence_scores: {}
    },
    keyframeLevel: []
  };
}

function calculateAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function calculateAverageConfidence(labels: any): number {
  if (!labels || !labels.confidence_scores) return 0.85; // Default confidence

  const scores = Object.values(labels.confidence_scores) as number[];
  if (scores.length === 0) return 0.85;

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
