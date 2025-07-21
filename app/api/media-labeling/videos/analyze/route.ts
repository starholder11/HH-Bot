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

    // 2. Update status to 'processing' at the start
    await updateVideoAsset(videoId, {
      processing_status: {
        ...videoAsset.processing_status,
        ai_labeling: 'processing',
        keyframe_extraction: 'processing'
      },
      updated_at: new Date().toISOString()
    });

    console.log('Video asset found:', {
      id: videoAsset.id,
      filename: videoAsset.filename,
      s3_url: videoAsset.s3_url,
      hasS3Url: !!videoAsset.s3_url
    });

    // Check if we're in production (Vercel) and should use Lambda
    console.log('Environment check:', {
      VERCEL_ENV: process.env.VERCEL_ENV,
      NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL
    });

    // Always use Lambda for now - environment detection unreliable
    const isProduction = true; // Force Lambda usage

    if (isProduction) {
      console.log('Production environment detected, using Lambda for video analysis');

      // Forward to Lambda API route - handle potential undefined origin
      const origin = request.nextUrl?.origin || 'https://hh-bot-lyart.vercel.app';
      const lambdaUrl = new URL('/api/video-processing/lambda', origin);

      if (!videoAsset.s3_url) {
        console.error('Video asset missing S3 URL:', videoAsset);
        return NextResponse.json(
          { success: false, error: 'Video asset missing S3 URL' },
          { status: 400 }
        );
      }

      // Helper to invoke the lambda with retry logic – mitigates eventual-consistency "NoSuchKey" errors
      const invokeLambdaWithRetry = async (maxAttempts = 3, delayMs = 2000) => {
        let attempt = 0;
        let lastErr: any = null;
        while (attempt < maxAttempts) {
          attempt++;
          console.log(`[analyze] Invoking Lambda (attempt ${attempt}/${maxAttempts})`);
          const resp = await fetch(lambdaUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bucketName: 'hh-bot-images-2025-prod',
              videoKey: videoAsset.s3_url.split('/').slice(-2).join('/'),
              action: 'extract_keyframes'
            })
          });

          if (!resp.ok) {
            lastErr = await resp.text();
            console.warn('[analyze] Lambda HTTP failure:', resp.status, lastErr);
          } else {
            const json = await resp.json();
            if (json.success && json.lambdaResult && !json.lambdaResult.error) {
              return json; // Success
            }
            lastErr = JSON.stringify(json);
            console.warn('[analyze] Lambda logical failure:', lastErr);
          }

          // If here, we failed – wait then retry
          if (attempt < maxAttempts) {
            console.log(`[analyze] Retrying Lambda in ${delayMs}ms ...`);
            await new Promise(res => setTimeout(res, delayMs));
            delayMs *= 2; // exponential backoff
          }
        }
        throw new Error(`Lambda failed after ${maxAttempts} attempts: ${lastErr}`);
      };

      const lambdaResult = await invokeLambdaWithRetry();

      console.log('Lambda processing result:', lambdaResult);

      // If Lambda succeeded, continue with GPT-4V analysis using keyframe URLs
      if (lambdaResult.success && lambdaResult.lambdaResult) {
        const lambdaBody = JSON.parse(lambdaResult.lambdaResult.body);
        console.log('Lambda body:', lambdaBody);

        if (lambdaBody.success && lambdaBody.result?.extractedFrames) {
          // Build CloudFront URLs for the extracted keyframes (GPT-4V can't access private S3)
          // Force CloudFront URLs to ensure GPT-4V can access the images
          const keyframeUrls = lambdaBody.result.extractedFrames.map((frame: any) =>
            `https://drbs5yklwtho3.cloudfront.net/${frame.s3Key}`
          );

          console.log('Keyframe CloudFront URLs:', keyframeUrls);

          // Run GPT-4V analysis on the keyframes
          const gptAnalysis = await analyzeKeyframesFromUrls(keyframeUrls, analysisType);

          console.log('GPT-4V analysis result:', gptAnalysis);

          if (gptAnalysis.success) {
            // Create keyframe still assets from the Lambda results
            const keyframeStills = [];
            for (let i = 0; i < lambdaBody.result.extractedFrames.length; i++) {
              const frame = lambdaBody.result.extractedFrames[i];
              const timestampMinutes = Math.floor(frame.timestamp / 60);
              const timestampSeconds = Math.floor(frame.timestamp % 60);
              const timestampFormatted = `${timestampMinutes.toString().padStart(2, '0')}:${timestampSeconds.toString().padStart(2, '0')}`;

              const keyframeAsset = {
                id: crypto.randomUUID(),
                parent_video_id: videoId,
                project_id: videoAsset.project_id,
                media_type: 'keyframe_still' as const,
                timestamp: timestampFormatted,
                frame_number: Math.floor(frame.timestamp * 25), // Estimate using fps from metadata
                filename: frame.filename,
                title: `${videoAsset.title} - Frame ${i + 1}`,
                s3_url: `https://hh-bot-images-2025-prod.s3.amazonaws.com/${frame.s3Key}`,
                cloudflare_url: `https://drbs5yklwtho3.cloudfront.net/${frame.s3Key}`,
                reusable_as_image: true,
                source_info: {
                  video_filename: videoAsset.filename,
                  timestamp: timestampFormatted,
                  frame_number: Math.floor(frame.timestamp * 25),
                  extraction_method: 'lambda'
                },
                metadata: {
                  file_size: 150000, // Estimate
                  format: 'jpeg',
                  resolution: { width: 1024, height: 1024 },
                  aspect_ratio: '1:1',
                  color_profile: 'sRGB',
                  quality: 85
                },
                usage_tracking: {
                  times_reused: 0,
                  projects_used_in: [],
                  last_used: null
                },
                processing_status: {
                  extraction: 'completed' as const,
                  ai_labeling: 'pending' as const,
                  manual_review: 'pending' as const
                },
                timestamps: {
                  extracted: new Date().toISOString(),
                  labeled_ai: null,
                  labeled_reviewed: null
                },
                labeling_complete: false
              };
              keyframeStills.push(keyframeAsset);
            }

            // Update video asset with analysis results AND keyframes
            await updateVideoAsset(videoId, {
              ai_labels: gptAnalysis.videoLevelLabels,
              keyframe_stills: keyframeStills,
              keyframe_count: keyframeStills.length,
              processing_status: {
                ...videoAsset.processing_status,
                ai_labeling: 'completed',
                keyframe_extraction: 'completed'
              },
              timestamps: {
                ...videoAsset.timestamps,
                labeled_ai: new Date().toISOString(),
                keyframes_extracted: new Date().toISOString()
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
          } else {
            console.error('GPT-4V analysis failed:', gptAnalysis.error);
            return NextResponse.json(
              { success: false, error: `GPT-4V analysis failed: ${gptAnalysis.error}` },
              { status: 500 }
            );
          }
        } else {
          console.error('Lambda body missing extractedFrames:', lambdaBody);
          return NextResponse.json(
            { success: false, error: 'Lambda did not return keyframes' },
            { status: 500 }
          );
        }
      } else {
        console.error('Lambda processing failed:', lambdaResult);
        return NextResponse.json(
          { success: false, error: `Lambda processing failed: ${JSON.stringify(lambdaResult)}` },
          { status: 500 }
        );
      }
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

async function analyzeKeyframesFromUrls(keyframeUrls: string[], analysisType: string) {
  const analysisPrompts = {
    comprehensive: `
    Analyze these video keyframes and provide creative analysis. You MUST respond with valid JSON in this exact format:

    {
      "scenes": ["description of scenes/content"],
      "objects": ["list of objects seen"],
      "style": ["visual style descriptors"],
      "mood": ["mood and atmosphere descriptors"],
      "themes": ["thematic content"],
      "confidence_scores": {"scenes": 0.9, "objects": 0.95, "style": 0.85, "mood": 0.8, "themes": 0.9}
    }

    Focus on:
    - **scenes**: Describe what's happening in the video
    - **objects**: List visible objects, people, animals, etc.
    - **style**: Visual style (photographic, cinematic, artistic, realistic, etc.)
    - **mood**: Emotional tone (dramatic, serene, energetic, mysterious, etc.)
    - **themes**: Subject matter and themes (nature, urban, technology, etc.)

    Return ONLY the JSON object, no other text.
    `,

    style_focus: `
    Focus on artistic and visual style analysis. Return ONLY JSON in this format:
    {
      "scenes": ["content description"],
      "objects": ["visible objects"],
      "style": ["visual style descriptors"],
      "mood": ["mood descriptors"],
      "themes": ["themes"],
      "confidence_scores": {"scenes": 0.9, "objects": 0.95, "style": 0.85, "mood": 0.8, "themes": 0.9}
    }
    `,

    mood_themes: `
    Analyze mood, themes, and narrative elements. Return ONLY JSON in this format:
    {
      "scenes": ["content description"],
      "objects": ["visible objects"],
      "style": ["visual style descriptors"],
      "mood": ["mood descriptors"],
      "themes": ["themes"],
      "confidence_scores": {"scenes": 0.9, "objects": 0.95, "style": 0.85, "mood": 0.8, "themes": 0.9}
    }
    `
  };

  // Prepare message content
  const messageContent = [
    // Add all keyframe images first
    ...keyframeUrls.map((url, index) => ({
      type: "image_url" as const,
      image_url: {
        url: url,
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
  console.log('[parseGPT4VResponse] ==== STARTING PARSE ====');
  console.log('[parseGPT4VResponse] Raw response length:', responseText.length);
  console.log('[parseGPT4VResponse] FULL RESPONSE TEXT:', responseText);

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
      console.log('[parseGPT4VResponse] EXTRACTED JSON TEXT:', jsonText);

      const parsed = JSON.parse(jsonText);
      console.log('[parseGPT4VResponse] PARSED OBJECT:', JSON.stringify(parsed, null, 2));

      // Extract data with detailed validation and logging
      const videoLevel = {
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes : (parsed.scenes ? [String(parsed.scenes)] : []),
        objects: Array.isArray(parsed.objects) ? parsed.objects : (parsed.objects ? [String(parsed.objects)] : []),
        style: Array.isArray(parsed.style) ? parsed.style : (parsed.style ? [String(parsed.style)] : []),
        mood: Array.isArray(parsed.mood) ? parsed.mood : (parsed.mood ? [String(parsed.mood)] : []),
        themes: Array.isArray(parsed.themes) ? parsed.themes : (parsed.themes ? [String(parsed.themes)] : []),
        technical_quality: Array.isArray(parsed.technical_quality) ? parsed.technical_quality : [],
        confidence_scores: (typeof parsed.confidence_scores === 'object' && parsed.confidence_scores !== null) ? parsed.confidence_scores : {}
      };

      console.log('[parseGPT4VResponse] FINAL VIDEO LEVEL DATA:', JSON.stringify(videoLevel, null, 2));

      const result = {
        videoLevel,
        keyframeLevel: Array.isArray(parsed.keyframe_analysis) ? parsed.keyframe_analysis : []
      };

      console.log('[parseGPT4VResponse] RETURNING RESULT:', JSON.stringify(result, null, 2));
      return result;
    } else {
      console.error('[parseGPT4VResponse] NO JSON MATCH FOUND IN RESPONSE');
      console.log('[parseGPT4VResponse] Response text was:', responseText);
    }
  } catch (error) {
    console.error('[parseGPT4VResponse] PARSING ERROR:', error);
    console.log('[parseGPT4VResponse] Failed text:', responseText);
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
