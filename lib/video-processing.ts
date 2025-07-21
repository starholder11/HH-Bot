import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { createReadStream, createWriteStream } from 'fs';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from './s3-config';
const sharp = require('sharp');

/**
 * Get the appropriate FFmpeg/FFprobe executable path for the current environment
 */
function getFFmpegPath(tool: 'ffmpeg' | 'ffprobe'): string {
  // Environment variable override (for production/custom deployments)
  const envPath = process.env[`${tool.toUpperCase()}_PATH`];
  if (envPath) {
    return envPath;
  }

  // Development environment (macOS with Homebrew)
  if (process.env.NODE_ENV === 'development' && process.platform === 'darwin') {
    const brewPath = `/opt/homebrew/bin/${tool}`;
    if (require('fs').existsSync(brewPath)) {
      console.info(`[ffmpeg-path] using Homebrew binary at ${brewPath}`);
      return brewPath;
    }
  }

  // AWS Lambda layer typical locations
  const lambdaLayerPaths = [
    `/opt/bin/${tool}`,           // e.g. ffprobe binary in layer
    `/opt/${tool}`               // some layers drop directly under /opt
  ];

  for (const p of lambdaLayerPaths) {
    if (require('fs').existsSync(p)) {
      console.info(`[ffmpeg-path] using Lambda layer binary at ${p}`);
      return p;
    }
  }

  // Common Linux install path (e.g. docker image)
  const usrLocal = `/usr/local/bin/${tool}`;
  if (require('fs').existsSync(usrLocal)) {
    console.info(`[ffmpeg-path] using /usr/local binary at ${usrLocal}`);
    return usrLocal;
  }

  // Fallback to system PATH (works in many cloud environments)
  console.info(`[ffmpeg-path] falling back to system PATH for ${tool}`);
  return tool;
}

/**
 * Check if FFmpeg is available in the current environment
 */
async function isFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn(getFFmpegPath('ffmpeg'), ['-version'], {
      stdio: 'ignore',
      timeout: 5000
    });

    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });

    ffmpeg.on('error', () => {
      resolve(false);
    });
  });
}

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
  sceneThreshold?: number; // Sensitivity for scene detection (0.1-1.0, default 0.3)
  skipSimilarFrames?: boolean; // Skip visually similar frames (default true)
  qualityThreshold?: number; // Minimum quality threshold (0-100, default 70)
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

  // Check if FFmpeg is available first
  const ffmpegAvailable = await isFFmpegAvailable();
  if (!ffmpegAvailable) {
    console.warn('FFmpeg not available in this environment. Video keyframe extraction is not supported.');
    throw new Error('FFmpeg is not available in this environment. Video processing requires FFmpeg to be installed.');
  }

  // First, get video duration and metadata
  const videoInfo = await getVideoInfo(videoPath);
  const duration = videoInfo.duration;

  console.log(`Video duration: ${duration}s`);

  // Determine frame extraction strategy
  const frameTimestamps = await calculateFrameTimestamps(videoPath, duration, options);

  console.log(`Extracting ${frameTimestamps.length} frames at timestamps:`, frameTimestamps);

  const extractedFrames: ExtractedFrame[] = [];

  // Extract each frame with optional similarity filtering
  for (let i = 0; i < frameTimestamps.length; i++) {
    const timestamp = frameTimestamps[i];
    const frameBuffer = await extractSingleFrame(videoPath, timestamp, options.maxSize);

    if (frameBuffer) {
      const newFrame: ExtractedFrame = {
        timestamp: formatTimestamp(timestamp),
        frameNumber: Math.floor(timestamp * 30), // Assuming 30fps for frame number calculation
        buffer: frameBuffer,
        width: options.maxSize?.width || 1024,
        height: options.maxSize?.height || 1024
      };

      // Check for similarity with existing frames if enabled
      if (options.skipSimilarFrames !== false) {
        const isSimilar = await isFrameSimilarToExisting(newFrame, extractedFrames);
        if (isSimilar) {
          console.log(`Skipping similar frame at ${formatTimestamp(timestamp)}`);
          continue;
        }
      }

      // Check frame quality if threshold is set
      if (options.qualityThreshold && options.qualityThreshold > 0) {
        const quality = await assessFrameQuality(newFrame.buffer);
        if (quality < options.qualityThreshold) {
          console.log(`Skipping low quality frame at ${formatTimestamp(timestamp)} (quality: ${quality})`);
          continue;
        }
      }

      extractedFrames.push(newFrame);
    }
  }

  console.log(`Successfully extracted ${extractedFrames.length} keyframes`);
  return extractedFrames;
}

/**
 * Calculate timestamps for frame extraction based on strategy
 */
async function calculateFrameTimestamps(
  videoPath: string,
  duration: number,
  options: KeyframeExtractionOptions
): Promise<number[]> {
  const { strategy, targetFrames } = options;

  switch (strategy) {
    case 'uniform':
      return calculateUniformTimestamps(duration, targetFrames);

    case 'adaptive':
      return calculateAdaptiveTimestamps(duration, targetFrames);

    case 'scene_change':
      return await calculateSceneChangeTimestamps(
        videoPath,
        duration,
        targetFrames,
        options.sceneThreshold || 0.3
      );

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
 * Calculate scene change timestamps using FFmpeg scene detection
 */
async function calculateSceneChangeTimestamps(
  videoPath: string,
  duration: number,
  targetFrames: number,
  sceneThreshold: number = 0.3
): Promise<number[]> {
  console.log(`Detecting scene changes with FFmpeg (threshold: ${sceneThreshold})...`);

  return new Promise((resolve) => {
    const ffmpeg = spawn(getFFmpegPath('ffmpeg'), [
      '-i', videoPath,
      '-vf', `select=gt(scene\\,${sceneThreshold}),showinfo`,
      '-vsync', 'vfr',
      '-f', 'null',
      '-'
    ]);

    let stderr = '';
    const sceneTimestamps: number[] = [];

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      // Parse scene detection output from stderr
      const lines = stderr.split('\n');
      for (const line of lines) {
        const match = line.match(/pts_time:(\d+\.?\d*)/);
        if (match) {
          const timestamp = parseFloat(match[1]);
          if (timestamp > 0.5 && timestamp < duration - 0.5) {
            sceneTimestamps.push(timestamp);
          }
        }
      }

      console.log(`Found ${sceneTimestamps.length} scene changes`);

      // If we found enough scene changes, use them
      if (sceneTimestamps.length >= targetFrames) {
        // Sort and take the most significant scene changes
        sceneTimestamps.sort((a, b) => a - b);
        const interval = Math.max(1, Math.floor(sceneTimestamps.length / targetFrames));
        const selectedTimestamps = [];

        for (let i = 0; i < targetFrames && i * interval < sceneTimestamps.length; i++) {
          selectedTimestamps.push(sceneTimestamps[i * interval]);
        }

        resolve(selectedTimestamps.slice(0, targetFrames));
      } else {
        // Fall back to adaptive if scene detection doesn't find enough changes
        console.log('Not enough scene changes detected, falling back to adaptive sampling');
        resolve(calculateAdaptiveTimestamps(duration, targetFrames));
      }
    });

    ffmpeg.on('error', (error) => {
      console.error('Scene detection error:', error);
      // Fall back to adaptive sampling on error
      resolve(calculateAdaptiveTimestamps(duration, targetFrames));
    });
  });
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

    const ffmpeg = spawn(getFFmpegPath('ffmpeg'), ffmpegArgs);

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
    const ffprobe = spawn(getFFmpegPath('ffprobe'), [
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
 * Check if a frame is visually similar to any existing frames
 */
async function isFrameSimilarToExisting(
  newFrame: ExtractedFrame,
  existingFrames: ExtractedFrame[],
  similarityThreshold: number = 0.85
): Promise<boolean> {
  if (existingFrames.length === 0) {
    return false;
  }

  try {
    // Get image stats for the new frame
    const newFrameStats = await sharp(newFrame.buffer).stats();

    // Compare with each existing frame
    for (const existingFrame of existingFrames) {
      const existingStats = await sharp(existingFrame.buffer).stats();

      // Simple similarity check based on channel means
      // This is a fast approximation - for more accuracy could use perceptual hashing
      const similarity = calculateImageSimilarity(newFrameStats, existingStats);

      if (similarity > similarityThreshold) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking frame similarity:', error);
    return false; // If error, don't skip the frame
  }
}

/**
 * Calculate basic image similarity based on channel statistics
 */
function calculateImageSimilarity(stats1: any, stats2: any): number {
  if (!stats1.channels || !stats2.channels) {
    return 0;
  }

  let totalSimilarity = 0;
  const channels = Math.min(stats1.channels.length, stats2.channels.length);

  for (let i = 0; i < channels; i++) {
    const mean1 = stats1.channels[i].mean;
    const mean2 = stats2.channels[i].mean;
    const maxMean = Math.max(mean1, mean2);
    const minMean = Math.min(mean1, mean2);

    if (maxMean === 0) {
      totalSimilarity += 1; // Both are black
    } else {
      totalSimilarity += minMean / maxMean;
    }
  }

  return totalSimilarity / channels;
}

/**
 * Assess frame quality based on brightness, contrast, and sharpness
 * Returns a quality score from 0-100
 */
async function assessFrameQuality(frameBuffer: Buffer): Promise<number> {
  try {
    const stats = await sharp(frameBuffer).stats();

    if (!stats.channels || stats.channels.length === 0) {
      return 0;
    }

    // Calculate brightness (avoid too dark or too bright)
    const brightness = stats.channels.reduce((sum: number, channel: any) => sum + channel.mean, 0) / stats.channels.length;
    const brightnessScore = brightness > 30 && brightness < 220 ? 100 : Math.max(0, 100 - Math.abs(brightness - 125) * 0.8);

    // Calculate contrast (standard deviation indicates contrast)
    const contrast = stats.channels.reduce((sum: number, channel: any) => sum + channel.std, 0) / stats.channels.length;
    const contrastScore = Math.min(100, contrast * 2); // Higher std = better contrast

    // Basic quality score combining brightness and contrast
    const qualityScore = (brightnessScore * 0.4) + (contrastScore * 0.6);

    return Math.round(qualityScore);

  } catch (error) {
    console.error('Error assessing frame quality:', error);
    return 100; // If error, assume frame is good quality
  }
}

/**
 * Extract keyframes with smart defaults based on video duration
 * Convenience function that automatically chooses the best strategy and settings
 */
export async function extractKeyframesWithSmartDefaults(
  videoPath: string,
  targetFrames?: number
): Promise<ExtractedFrame[]> {
  // Check if FFmpeg is available first
  const ffmpegAvailable = await isFFmpegAvailable();
  if (!ffmpegAvailable) {
    console.warn('FFmpeg not available in this environment. Video keyframe extraction is not supported.');
    throw new Error('FFmpeg is not available in this environment. Video processing requires FFmpeg to be installed.');
  }

  // Get video info to determine smart defaults
  const videoInfo = await getVideoInfo(videoPath);
  const duration = videoInfo.duration;

  // Determine smart defaults based on video duration
  let strategy: 'adaptive' | 'uniform' | 'scene_change' = 'adaptive';
  let frames = targetFrames || 8;

  if (duration > 300) { // Long videos (>5 min)
    strategy = 'scene_change';
    frames = targetFrames || 12;
  } else if (duration > 60) { // Medium videos (1-5 min)
    strategy = 'adaptive';
    frames = targetFrames || 8;
  } else { // Short videos (<1 min)
    strategy = 'uniform';
    frames = targetFrames || 5;
  }

  const options: KeyframeExtractionOptions = {
    strategy,
    targetFrames: frames,
    maxSize: { width: 1024, height: 1024 },
    sceneThreshold: 0.3,
    skipSimilarFrames: true,
    qualityThreshold: 60
  };

  console.log(`Using smart defaults for ${duration}s video: strategy=${strategy}, frames=${frames}`);

  return extractKeyframesFromVideo(videoPath, options);
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
