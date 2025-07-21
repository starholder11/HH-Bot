// Lambda worker entry – processes video analysis jobs using FFmpeg
// This runs in a Docker container with FFmpeg installed

const https = require('https');
const { URL } = require('url');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { spawn } = require('child_process');
const { promises: fs } = require('fs');
const path = require('path');

// Simple fetch replacement using native https
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          text: () => Promise.resolve(data),
          json: () => Promise.resolve(JSON.parse(data))
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

exports.handler = async (event) => {
  for (const record of event.Records) {
    try {
      const job = JSON.parse(record.body);
      console.log('[worker] processing job', job);

      if (job.mediaType !== 'video') {
        console.log('[worker] skipping non-video job');
        continue;
      }

      await processVideoJob(job);
      console.log('[worker] analysis completed OK', job.assetId);
    } catch (err) {
      console.error('[worker] job failed', err);
      throw err; // re-queue via SQS retry
    }
  }
};

async function processVideoJob(job) {
  const { assetId, strategy = 'adaptive' } = job;

  console.log(`[worker] Starting video processing for ${assetId}`);

  // Download video from S3
  const videoPath = `/tmp/${assetId}.mp4`;
  await downloadVideoFromS3(assetId, videoPath);

  // Extract keyframes using FFmpeg
  const keyframes = await extractKeyframesWithFFmpeg(videoPath, strategy);
  console.log(`[worker] Extracted ${keyframes.length} keyframes`);

  // Upload keyframes to S3 and create asset records
  const keyframeAssets = await uploadKeyframesToS3(keyframes, assetId);

  // Trigger AI labeling for video and keyframes
  await triggerAILabeling(assetId, keyframeAssets);

  // Clean up temp files
  await fs.unlink(videoPath).catch(() => {});
  for (const keyframe of keyframes) {
    await fs.unlink(keyframe.path).catch(() => {});
  }
}

async function downloadVideoFromS3(assetId, localPath) {
  console.log(`[worker] Downloading video ${assetId} from S3`);

  // Get video asset data to find S3 URL
  const baseUrl = process.env.PUBLIC_API_BASE_URL ?? `https://${process.env.VERCEL_URL}`;
  const assetResponse = await fetch(`${baseUrl}/api/media-labeling/assets/${assetId}`);

  if (!assetResponse.ok) {
    throw new Error(`Failed to get asset data: ${assetResponse.status}`);
  }

  const asset = await assetResponse.json();
  const s3Url = asset.s3_url;

  // Extract bucket and key from S3 URL
  const urlParts = new URL(s3Url);
  const bucket = urlParts.hostname.split('.')[0];
  const key = urlParts.pathname.slice(1);

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }

  await fs.writeFile(localPath, Buffer.concat(chunks));
  console.log(`[worker] Video downloaded to ${localPath}`);
}

async function extractKeyframesWithFFmpeg(videoPath, strategy) {
  console.log(`[worker] Extracting keyframes using ${strategy} strategy`);

  // Get video duration first
  const duration = await getVideoDuration(videoPath);
  const targetFrames = 5;

  // Calculate timestamps based on strategy
  const timestamps = calculateTimestamps(duration, targetFrames, strategy);

  const keyframes = [];

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const outputPath = `/tmp/keyframe_${i}_${Date.now()}.jpg`;

    await extractSingleFrame(videoPath, timestamp, outputPath);

    keyframes.push({
      path: outputPath,
      timestamp: formatTimestamp(timestamp),
      frameNumber: Math.floor(timestamp * 30), // Assuming 30fps
      index: i
    });
  }

  return keyframes;
}

async function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
    const ffprobe = spawn(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      videoPath
    ]);

    let stdout = '';
    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe failed with code ${code}`));
        return;
      }

      try {
        const info = JSON.parse(stdout);
        const duration = parseFloat(info.format.duration || '0');
        resolve(duration);
      } catch (error) {
        reject(new Error('Failed to parse video information'));
      }
    });
  });
}

async function extractSingleFrame(videoPath, timestamp, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const ffmpeg = spawn(ffmpegPath, [
      '-i', videoPath,
      '-ss', timestamp.toString(),
      '-frames:v', '1',
      '-q:v', '2',
      '-y',
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg failed with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function calculateTimestamps(duration, targetFrames, strategy) {
  switch (strategy) {
    case 'uniform':
      return Array.from({ length: targetFrames }, (_, i) =>
        (duration / (targetFrames + 1)) * (i + 1)
      );
    case 'adaptive':
    default:
      // Skip first/last 5% and distribute evenly
      const start = duration * 0.05;
      const end = duration * 0.95;
      const interval = (end - start) / (targetFrames - 1);
      return Array.from({ length: targetFrames }, (_, i) => start + i * interval);
  }
}

function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

async function uploadKeyframesToS3(keyframes, assetId) {
  console.log(`[worker] Uploading ${keyframes.length} keyframes to S3`);

  const keyframeAssets = [];
  const bucket = 'hh-bot-images-2025-prod'; // TODO: Make this configurable

  for (const keyframe of keyframes) {
    const filename = `${assetId}_keyframe_${keyframe.index + 1}.jpg`;
    const key = `keyframes/${assetId}/${filename}`;

    const buffer = await fs.readFile(keyframe.path);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg'
    });

    await s3Client.send(command);

    const s3Url = `https://${bucket}.s3.amazonaws.com/${key}`;
    const cloudflareUrl = `https://drbs5yklwtho3.cloudfront.net/${key}`;

    keyframeAssets.push({
      filename,
      s3Url,
      cloudflareUrl,
      timestamp: keyframe.timestamp,
      frameNumber: keyframe.frameNumber,
      index: keyframe.index
    });
  }

  return keyframeAssets;
}

async function triggerAILabeling(assetId, keyframeAssets) {
  console.log(`[worker] Triggering AI labeling for video ${assetId} and ${keyframeAssets.length} keyframes`);

  const baseUrl = process.env.PUBLIC_API_BASE_URL ?? `https://${process.env.VERCEL_URL}`;

  // Update video status and create keyframe assets
  const updateResponse = await fetch(`${baseUrl}/api/media-labeling/videos/update-keyframes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId, keyframeAssets }),
  });

  if (!updateResponse.ok) {
    throw new Error(`Failed to update video with keyframes: ${updateResponse.status}`);
  }

  console.log(`[worker] Successfully processed video ${assetId}`);
}
