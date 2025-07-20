import { spawn } from 'child_process';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from './s3-config';
import sharp from 'sharp';

export interface ExtractedFrame {
  timestamp: string;
  frameNumber: number;
  buffer: Buffer;
  width: number;
  height: number;
}

export interface KeyframeExtractionOptions {
  strategy: 'adaptive' | 'uniform' | 'scene_change';
  targetFrames: number;
  maxSize?: { width: number; height: number };
}

/**
 * Download video file from S3 to local temporary path
 */
export async function downloadFromS3(s3Url: string, localPath: string): Promise<void> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  // Extract key from S3 URL
  const urlParts = s3Url.split('/');
  const key = urlParts.slice(3).join('/').replace(/%2F/g, '/');

  console.log(`Downloading video from S3: ${key} -> ${localPath}`);

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('No body in S3 response');
    }

        // Stream the S3 object to local file
    const writeStream = createWriteStream(localPath);

    if (response.Body instanceof ReadableStream) {
      const reader = response.Body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          writeStream.write(Buffer.from(value));
        }
      }
      writeStream.end();
    } else {
      // Handle other types of body (Node.js stream)
      const body = response.Body as any;
      body.pipe(writeStream);
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    console.log(`Video downloaded successfully to: ${localPath}`);

  } catch (error) {
    console.error('S3 download error:', error);
    throw new Error(`Failed to download video from S3: ${error}`);
  }
}

/**
 * Upload keyframe image buffer to S3
 */
export async function uploadKeyframeToS3(imageBuffer: Buffer, s3Key: string): Promise<string> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  console.log(`Uploading keyframe to S3: ${s3Key}`);

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
      ContentDisposition: 'inline'
    });

    await s3Client.send(command);

    const s3Url = `https://${bucketName}.s3.amazonaws.com/${s3Key}`;
    console.log(`Keyframe uploaded successfully: ${s3Url}`);

    return s3Url;

  } catch (error) {
    console.error('S3 keyframe upload error:', error);
    throw new Error(`Failed to upload keyframe to S3: ${error}`);
  }
}

/**
 * Extract keyframes from video using FFmpeg
 */
export async function extractKeyframesFromVideo(
  videoPath: string,
  options: KeyframeExtractionOptions
): Promise<ExtractedFrame[]> {
  console.log(`Extracting keyframes from: ${videoPath}`);

  // First, get video duration and metadata
  const videoInfo = await getVideoInfo(videoPath);
  const duration = videoInfo.duration;

  console.log(`Video duration: ${duration}s`);

  // Determine frame extraction strategy
  const frameTimestamps = calculateFrameTimestamps(duration, options);

  console.log(`Extracting ${frameTimestamps.length} frames at timestamps:`, frameTimestamps);

  const extractedFrames: ExtractedFrame[] = [];

  // Extract each frame
  for (let i = 0; i < frameTimestamps.length; i++) {
    const timestamp = frameTimestamps[i];
    const frameBuffer = await extractSingleFrame(videoPath, timestamp, options.maxSize);

    if (frameBuffer) {
      extractedFrames.push({
        timestamp: formatTimestamp(timestamp),
        frameNumber: Math.floor(timestamp * 30), // Assuming 30fps for frame number calculation
        buffer: frameBuffer,
        width: options.maxSize?.width || 1024,
        height: options.maxSize?.height || 1024
      });
    }
  }

  console.log(`Successfully extracted ${extractedFrames.length} keyframes`);
  return extractedFrames;
}

/**
 * Calculate timestamps for frame extraction based on strategy
 */
function calculateFrameTimestamps(
  duration: number,
  options: KeyframeExtractionOptions
): number[] {
  const { strategy, targetFrames } = options;

  switch (strategy) {
    case 'uniform':
      return calculateUniformTimestamps(duration, targetFrames);

    case 'adaptive':
      return calculateAdaptiveTimestamps(duration, targetFrames);

    case 'scene_change':
      // For now, fallback to adaptive (scene detection requires more complex FFmpeg analysis)
      return calculateAdaptiveTimestamps(duration, targetFrames);

    default:
      return calculateUniformTimestamps(duration, targetFrames);
  }
}

/**
 * Calculate uniform frame timestamps
 */
function calculateUniformTimestamps(duration: number, targetFrames: number): number[] {
  if (duration <= 0 || targetFrames <= 0) return [];

  const timestamps: number[] = [];
  const interval = duration / (targetFrames + 1);

  for (let i = 1; i <= targetFrames; i++) {
    timestamps.push(i * interval);
  }

  return timestamps;
}

/**
 * Calculate adaptive frame timestamps based on video length
 */
function calculateAdaptiveTimestamps(duration: number, targetFrames: number): number[] {
  if (duration <= 0 || targetFrames <= 0) return [];

  const timestamps: number[] = [];

  if (duration <= 10) {
    // Short video: every 2 seconds, skip first/last 0.5 seconds
    const start = 0.5;
    const end = duration - 0.5;
    const interval = Math.max(2, (end - start) / targetFrames);

    for (let i = 0; i < targetFrames && start + i * interval < end; i++) {
      timestamps.push(start + i * interval);
    }
  } else if (duration <= 300) {
    // Medium video: skip first/last 5%, distribute evenly
    const start = duration * 0.05;
    const end = duration * 0.95;
    const interval = (end - start) / (targetFrames + 1);

    for (let i = 1; i <= targetFrames; i++) {
      timestamps.push(start + i * interval);
    }
  } else {
    // Long video: skip first/last 10%, distribute evenly
    const start = duration * 0.1;
    const end = duration * 0.9;
    const interval = (end - start) / (targetFrames + 1);

    for (let i = 1; i <= targetFrames; i++) {
      timestamps.push(start + i * interval);
    }
  }

  return timestamps.slice(0, targetFrames);
}

/**
 * Extract a single frame at the specified timestamp
 */
async function extractSingleFrame(
  videoPath: string,
  timestamp: number,
  maxSize?: { width: number; height: number }
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const outputPath = `/tmp/frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;

    const ffmpegArgs = [
      '-i', videoPath,
      '-ss', timestamp.toString(),
      '-frames:v', '1',
      '-q:v', '2', // High quality
      '-y', // Overwrite output file
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', async (code) => {
      if (code !== 0) {
        console.error(`FFmpeg error (code ${code}):`, stderr);
        resolve(null);
        return;
      }

      try {
        // Read and optionally resize the extracted frame
        let frameBuffer = await fs.readFile(outputPath);

        if (maxSize) {
          frameBuffer = await sharp(frameBuffer)
            .resize(maxSize.width, maxSize.height, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ quality: 85 })
            .toBuffer();
        }

        // Clean up temporary file
        await fs.unlink(outputPath).catch(() => {});

        resolve(frameBuffer);

      } catch (error) {
        console.error('Frame processing error:', error);
        await fs.unlink(outputPath).catch(() => {});
        resolve(null);
      }
    });

    ffmpeg.on('error', (error) => {
      console.error('FFmpeg spawn error:', error);
      resolve(null);
    });
  });
}

/**
 * Get video information using FFprobe
 */
async function getVideoInfo(videoPath: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        console.error(`FFprobe error (code ${code}):`, stderr);
        reject(new Error(`FFprobe failed with code ${code}`));
        return;
      }

      try {
        const info = JSON.parse(stdout);
        const videoStream = info.streams.find((stream: any) => stream.codec_type === 'video');

        const duration = parseFloat(info.format.duration || '0');
        const width = parseInt(videoStream?.width || '0');
        const height = parseInt(videoStream?.height || '0');

        resolve({ duration, width, height });

      } catch (error) {
        console.error('FFprobe parse error:', error);
        reject(new Error('Failed to parse video information'));
      }
    });

    ffprobe.on('error', (error) => {
      console.error('FFprobe spawn error:', error);
      reject(error);
    });
  });
}

/**
 * Format timestamp in HH:MM:SS format
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
