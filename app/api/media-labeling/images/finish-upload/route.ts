import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

// Storage utilities (we'll create these next)
import { saveMediaAsset } from '@/lib/media-storage';
import { addAssetToProject } from '@/lib/project-storage';

interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  file_size: number;
  color_space?: string;
  has_alpha?: boolean;
  density?: number;
  aspect_ratio: string;
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', err => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function calculateAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  const ratioWidth = width / divisor;
  const ratioHeight = height / divisor;

  // Common aspect ratios
  if (ratioWidth === 16 && ratioHeight === 9) return '16:9';
  if (ratioWidth === 4 && ratioHeight === 3) return '4:3';
  if (ratioWidth === 3 && ratioHeight === 2) return '3:2';
  if (ratioWidth === 1 && ratioHeight === 1) return '1:1';
  if (ratioWidth === 5 && ratioHeight === 4) return '5:4';
  if (ratioWidth === 21 && ratioHeight === 9) return '21:9';

  return `${ratioWidth}:${ratioHeight}`;
}

async function extractImageMetadata(imageBuffer: Buffer): Promise<ImageMetadata> {
  try {
    // Use dynamic import for sharp to avoid module loading issues in serverless environment
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch (sharpError) {
      console.warn('Sharp not available, using fallback metadata extraction:', sharpError);
      // Fallback to basic metadata without sharp
      return {
        width: 1,
        height: 1,
        format: 'unknown',
        file_size: imageBuffer.length,
        color_space: 'srgb',
        has_alpha: false,
        density: 72,
        aspect_ratio: '1:1'
      };
    }

    const metadata = await sharp(imageBuffer).metadata();

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      file_size: imageBuffer.length,
      color_space: metadata.space,
      has_alpha: metadata.hasAlpha,
      density: metadata.density,
      aspect_ratio: calculateAspectRatio(metadata.width || 1, metadata.height || 1)
    };
  } catch (error) {
    console.error('Error extracting image metadata:', error);
    // Return basic fallback metadata instead of throwing
    return {
      width: 1,
      height: 1,
      format: 'unknown',
      file_size: imageBuffer.length,
      color_space: 'srgb',
      has_alpha: false,
      density: 72,
      aspect_ratio: '1:1'
    };
  }
}

// Force this route to deploy as a Node.js function to support POST requests and file processing
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, originalFilename, projectId } = body;

    console.log('Completing image upload for:', originalFilename, 'with key:', key);

    // Generate URLs from key (same logic as get-upload-url endpoint)
    const bucketName = getBucketName();
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    const s3Url = `https://${bucketName}.s3.amazonaws.com/${encodedKey}`;
    const cloudflareUrl = `https://${process.env.CLOUDFLARE_DOMAIN || process.env.AWS_CLOUDFRONT_DOMAIN}/${encodedKey}`;

    // Download the file from S3 for metadata extraction
    const s3Client = getS3Client();

    let imageBuffer: Buffer;
    try {
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const response = await s3Client.send(getCommand);
      imageBuffer = await streamToBuffer(response.Body as Readable);
    } catch (error) {
      console.error('Failed to download image from S3:', error);
      return NextResponse.json(
        { error: 'Failed to access uploaded image' },
        { status: 500 }
      );
    }

    // Extract metadata
    const metadata = await extractImageMetadata(imageBuffer);
    console.log('Extracted metadata:', metadata);

    // Create image asset record
    const imageId = uuidv4();
    const now = new Date().toISOString();

    // Extract title from filename (remove extension)
    // Handle case where originalFilename might be undefined
    const safeFilename = originalFilename || key.split('/').pop() || 'untitled';
    const title = safeFilename.replace(/\.[^/.]+$/, '');

    const imageData = {
      id: imageId,
      filename: originalFilename,
      s3_url: s3Url,
      cloudflare_url: cloudflareUrl,
      title: title,
      media_type: 'image' as const,
      metadata: metadata,
      ai_labels: {
        scenes: [],
        objects: [],
        style: [],
        mood: [],
        themes: [],
        confidence_scores: {}
      },
      manual_labels: {
        scenes: [],
        objects: [],
        style: [],
        mood: [],
        themes: [],
        custom_tags: []
      },
      processing_status: {
        upload: 'completed' as const,
        metadata_extraction: 'completed' as const,
        ai_labeling: 'pending' as const,
        manual_review: 'pending' as const
      },
      timestamps: {
        uploaded: now,
        metadata_extracted: now,
        labeled_ai: null,
        labeled_reviewed: null
      },
      labeling_complete: false,
      project_id: projectId || null,
      created_at: now,
      updated_at: now
    };

    // Save image data
    console.log('Saving image data for:', title);
    await saveMediaAsset(imageId, imageData);

    // Add to project if specified
    if (projectId) {
      try {
        await addAssetToProject(projectId, imageId, 'image');
        console.log('Added image to project:', projectId);
      } catch (error) {
        console.error('Failed to add image to project:', error);
        // Don't fail the entire upload if project assignment fails
      }
    }

        // Auto-trigger AI labeling for uploaded image
    try {
      console.log('Auto-triggering AI labeling for:', imageId);

      // Import and call the shared AI labeling function directly
      const { performAiLabeling } = await import('@/lib/ai-labeling');
      await performAiLabeling(imageId);

      console.log('AI labeling auto-triggered successfully for:', imageId);
    } catch (error) {
      console.error('Error auto-triggering AI labeling:', error);
      // Don't fail the upload if AI labeling fails
    }

    return NextResponse.json({
      success: true,
      image: imageData
    });

  } catch (error) {
    console.error('Image upload completion error:', error);
    const message = (error as Error)?.message || 'Failed to complete image upload';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
