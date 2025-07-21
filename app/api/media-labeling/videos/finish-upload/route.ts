import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { v4 as uuidv4 } from 'uuid';
import { parseBuffer } from 'music-metadata';
import { Readable } from 'stream';

// Storage utilities
import { saveMediaAsset } from '@/lib/media-storage';
import { addAssetToProject } from '@/lib/project-storage';

interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  format: string;
  file_size: number;
  codec?: string;
  frame_rate?: number;
  aspect_ratio: string;
  bitrate?: number;
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
  if (!width || !height) return '16:9'; // default fallback

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

async function extractVideoMetadata(videoBuffer: Buffer, originalFilename: string): Promise<VideoMetadata> {
  try {
    // Use music-metadata to parse video metadata
    const metadata = await parseBuffer(videoBuffer, getVideoMimeType(originalFilename));

    // Extract video track information - music-metadata may have trackInfo for advanced containers
    const videoTrack = (metadata as any).trackInfo?.find((track: any) => track.type === 'video')?.video;
    const format = metadata.format;

    const width = videoTrack?.pixelWidth || videoTrack?.displayWidth || 0;
    const height = videoTrack?.pixelHeight || videoTrack?.displayHeight || 0;

    return {
      width,
      height,
      duration: format.duration || 0,
      format: format.container || getVideoFormat(originalFilename),
      file_size: videoBuffer.length,
      codec: format.codec || 'unknown',
      frame_rate: parseFloat(format.codecProfile?.split('@')[1] || '0'),
      aspect_ratio: calculateAspectRatio(width, height),
      bitrate: format.bitrate || 0
    };
  } catch (error) {
    console.error('Error extracting video metadata:', error);

    // Fallback metadata when parsing fails
    return {
      width: 0,
      height: 0,
      duration: 0,
      format: getVideoFormat(originalFilename),
      file_size: videoBuffer.length,
      codec: 'unknown',
      frame_rate: 0,
      aspect_ratio: '16:9',
      bitrate: 0
    };
  }
}

function getVideoMimeType(filename: string): string {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  switch (ext) {
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.avi': return 'video/x-msvideo';
    case '.webm': return 'video/webm';
    case '.ogv': return 'video/ogg';
    case '.3gp': return 'video/3gpp';
    case '.wmv': return 'video/x-ms-wmv';
    default: return 'video/mp4';
  }
}

function getVideoFormat(filename: string): string {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return ext.substring(1); // Remove the dot
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, originalFilename, projectId } = body;

    console.log('Completing video upload for:', originalFilename, 'with key:', key);

    // Generate URLs from key (same logic as get-upload-url endpoint)
    const bucketName = getBucketName();
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    const s3Url = `https://${bucketName}.s3.amazonaws.com/${encodedKey}`;
    const cloudflareUrl = `https://${process.env.CLOUDFLARE_DOMAIN || process.env.AWS_CLOUDFRONT_DOMAIN}/${encodedKey}`;

    // Download video file from S3 to extract metadata
    const s3Client = getS3Client();
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    const s3Response = await s3Client.send(getObjectCommand);

    if (!s3Response.Body) {
      throw new Error('No video data received from S3');
    }

    // Convert S3 stream to buffer
    const videoBuffer = await streamToBuffer(s3Response.Body as Readable);

    // Extract metadata
    const metadata = await extractVideoMetadata(videoBuffer, originalFilename);

    console.log('Extracted metadata:', metadata);

    // Extract title from filename (remove extension)
    const title = originalFilename.replace(/\.[^/.]+$/, '');

    // Generate unique ID for the video
    const videoId = uuidv4();

    // Save video data using media storage utility
    const videoAsset = {
      id: videoId,
      filename: originalFilename,
      s3_url: s3Url,
      cloudflare_url: cloudflareUrl,
      title,
      media_type: 'video' as const,
      metadata,
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
        uploaded: new Date().toISOString(),
        metadata_extracted: new Date().toISOString(),
        labeled_ai: null,
        labeled_reviewed: null
      },
      labeling_complete: false,
      project_id: projectId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('Saving video data for:', title);

    // Save the video asset
    await saveMediaAsset(videoId, videoAsset);

    // Add to project if specified
    if (projectId) {
      await addAssetToProject(projectId, videoId, 'video');
    }

    // Auto-trigger video analysis for uploaded video
    try {
      console.log('Auto-triggering video analysis for:', videoId);

      // Trigger video analysis via internal API call
      const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://hh-bot-lyart.vercel.app';
      const analysisResponse = await fetch(`${origin}/api/media-labeling/videos/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: videoId,
          strategy: 'adaptive', // Default to adaptive strategy
        }),
      });

      if (analysisResponse.ok) {
        console.log('Video analysis auto-triggered successfully for:', videoId);
      } else {
        console.error('Failed to auto-trigger video analysis:', await analysisResponse.text());
      }
    } catch (error) {
      console.error('Error auto-triggering video analysis:', error);
      // Don't fail the upload if analysis triggering fails
    }

    console.log('Video upload completion successful for:', videoId);

    return NextResponse.json({
      success: true,
      assetId: videoId,
      title,
      metadata,
      s3Url,
      cloudflareUrl
    });

  } catch (error) {
    console.error('Video upload completion error:', error);
    return NextResponse.json(
      { error: 'Failed to complete video upload' },
      { status: 500 }
    );
  }
}
