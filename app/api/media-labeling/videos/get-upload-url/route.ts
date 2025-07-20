import { NextRequest, NextResponse } from 'next/server';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { v4 as uuidv4 } from 'uuid';

// Maximum file size: 500MB for videos (much larger than images)
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// Allowed video formats
const ALLOWED_FORMATS = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/ogg',
  'video/3gpp',
  'video/x-ms-wmv'
];

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.ogv', '.3gp', '.wmv'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, fileSize, projectId } = body;

    // Validate required fields
    if (!filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    if (!fileSize) {
      return NextResponse.json(
        { error: 'File size is required' },
        { status: 400 }
      );
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    // Extract file extension from filename
    const fileExtension = filename.toLowerCase().substring(filename.lastIndexOf('.'));

    // Validate file extension
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return NextResponse.json(
        { error: `Unsupported video format. Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // Generate unique key for the video
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `videos/${timestamp}-${randomId}-${sanitizedFilename}`;

    // Generate S3 presigned URL
    const s3Client = getS3Client();
    const bucketName = getBucketName();

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: 'video/*', // Will be more specific based on file extension
      ContentLength: fileSize,
      Metadata: {
        'original-filename': filename,
        'upload-timestamp': timestamp.toString(),
        ...(projectId && { 'project-id': projectId })
      }
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600 // 1 hour to complete video upload
    });

    // Generate the final URLs that will be used after upload
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    const s3Url = `https://${bucketName}.s3.amazonaws.com/${encodedKey}`;
    const cloudflareUrl = `https://${process.env.CLOUDFLARE_DOMAIN || process.env.AWS_CLOUDFRONT_DOMAIN}/${encodedKey}`;

    return NextResponse.json({
      uploadUrl,
      key,
      s3Url,
      cloudflareUrl,
      maxFileSize: MAX_FILE_SIZE
    });

  } catch (error) {
    console.error('Error generating video upload URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
