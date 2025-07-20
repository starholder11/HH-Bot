const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables for FFmpeg paths
const FFMPEG_PATH = process.env.FFMPEG_PATH || '/usr/local/bin/ffmpeg';
const FFPROBE_PATH = process.env.FFPROBE_PATH || '/usr/local/bin/ffprobe';

exports.handler = async (event) => {
    console.log('Lambda video processor invoked:', JSON.stringify(event, null, 2));

    try {
        const { bucketName, videoKey, action = 'extract_keyframes', outputBucket } = event;

        if (!bucketName || !videoKey) {
            throw new Error('bucketName and videoKey are required');
        }

        // Download video from S3
        const videoPath = await downloadVideo(bucketName, videoKey);

        let result;
        switch (action) {
            case 'extract_keyframes':
                result = await extractKeyframes(videoPath, videoKey, outputBucket || bucketName);
                break;
            case 'get_metadata':
                result = await getVideoMetadata(videoPath);
                break;
            default:
                throw new Error(`Unsupported action: ${action}`);
        }

        // Cleanup
        if (fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                action,
                result
            })
        };

    } catch (error) {
        console.error('Lambda error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};

async function downloadVideo(bucketName, videoKey) {
    const tmpPath = `/tmp/${path.basename(videoKey)}`;

    try {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: videoKey
        });

        const response = await s3Client.send(command);
        const stream = response.Body;

        return new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(tmpPath);
            stream.pipe(writeStream);

            writeStream.on('finish', () => {
                console.log(`Video downloaded to ${tmpPath}`);
                resolve(tmpPath);
            });

            writeStream.on('error', reject);
        });

    } catch (error) {
        console.error('Download error:', error);
        throw new Error(`Failed to download video: ${error.message}`);
    }
}

async function getVideoMetadata(videoPath) {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn(FFPROBE_PATH, [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            videoPath
        ]);

        let output = '';
        let errorOutput = '';

        ffprobe.stdout.on('data', (data) => {
            output += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        ffprobe.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`FFprobe failed: ${errorOutput}`));
                return;
            }

            try {
                const metadata = JSON.parse(output);
                const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');

                resolve({
                    duration: parseFloat(metadata.format.duration) || 0,
                    width: videoStream ? videoStream.width : 0,
                    height: videoStream ? videoStream.height : 0,
                    fps: videoStream ? eval(videoStream.r_frame_rate) : 0,
                    codec: videoStream ? videoStream.codec_name : 'unknown',
                    format: metadata.format.format_name
                });
            } catch (parseError) {
                reject(new Error(`Failed to parse metadata: ${parseError.message}`));
            }
        });
    });
}

async function extractKeyframes(videoPath, videoKey, outputBucket) {
    // Get video metadata first
    const metadata = await getVideoMetadata(videoPath);
    const duration = metadata.duration;

    if (duration <= 0) {
        throw new Error('Invalid video duration');
    }

    // Calculate keyframe timestamps (3-5 frames)
    const frameCount = Math.min(5, Math.max(3, Math.floor(duration / 2)));
    const interval = duration / (frameCount + 1);
    const timestamps = [];

    for (let i = 1; i <= frameCount; i++) {
        timestamps.push(interval * i);
    }

    console.log(`Extracting ${frameCount} keyframes at timestamps:`, timestamps);

    const extractedFrames = [];
    const baseFileName = path.basename(videoKey, path.extname(videoKey));

    for (let i = 0; i < timestamps.length; i++) {
        const timestamp = timestamps[i];
        const frameFileName = `${baseFileName}_keyframe_${String(i + 1).padStart(2, '0')}.jpg`;
        const framePath = `/tmp/${frameFileName}`;

        // Extract frame using FFmpeg
        await extractSingleFrame(videoPath, timestamp, framePath);

        // Upload to S3
        const s3Key = `keyframes/${baseFileName}/${frameFileName}`;
        await uploadFrameToS3(framePath, outputBucket, s3Key);

        extractedFrames.push({
            timestamp,
            s3Key,
            filename: frameFileName
        });

        // Cleanup frame file
        if (fs.existsSync(framePath)) {
            fs.unlinkSync(framePath);
        }
    }

    return {
        metadata,
        extractedFrames,
        frameCount: extractedFrames.length
    };
}

async function extractSingleFrame(videoPath, timestamp, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(FFMPEG_PATH, [
            '-i', videoPath,
            '-ss', timestamp.toString(),
            '-vframes', '1',
            '-q:v', '2',
            '-y',
            outputPath
        ]);

        let errorOutput = '';

        ffmpeg.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`FFmpeg frame extraction failed: ${errorOutput}`));
                return;
            }

            if (!fs.existsSync(outputPath)) {
                reject(new Error('Frame file was not created'));
                return;
            }

            console.log(`Frame extracted: ${outputPath}`);
            resolve();
        });
    });
}

async function uploadFrameToS3(filePath, bucketName, s3Key) {
    try {
        const fileBuffer = fs.readFileSync(filePath);

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: 'image/jpeg'
        });

        await s3Client.send(command);
        console.log(`Frame uploaded to S3: ${s3Key}`);

    } catch (error) {
        console.error('S3 upload error:', error);
        throw new Error(`Failed to upload frame: ${error.message}`);
    }
}
