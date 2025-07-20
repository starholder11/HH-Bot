import { NextRequest, NextResponse } from 'next/server';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { v4 as uuidv4 } from 'uuid';

// Maximum file size: 50MB for images
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Allowed image formats
const ALLOWED_FORMATS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff'
];

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];

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

    // Validate file extension
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        { error: `File type ${extension} not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `images/${timestamp}-${randomId}-${safeName}`;

    // Generate presigned URL
    const s3Client = getS3Client();
    const bucketName = getBucketName();

    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: getContentTypeFromExtension(extension),
      ContentLength: fileSize,
      CacheControl: 'max-age=31536000', // 1 year
    });

    const uploadUrl = await getSignedUrl(s3Client, putCommand, {
      expiresIn: 3600 // 1 hour
    });

    // Generate final URLs
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    const s3Url = `https://${bucketName}.s3.amazonaws.com/${encodedKey}`;
    const cloudflareUrl = `https://${process.env.CLOUDFLARE_DOMAIN || process.env.AWS_CLOUDFRONT_DOMAIN}/${encodedKey}`;

    return NextResponse.json({
      uploadUrl,
      s3Url,
      cloudflareUrl,
      key,
      projectId: projectId || null
    });

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    const message = (error as Error)?.message || 'Failed to generate upload URL';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

function getContentTypeFromExtension(extension: string): string {
  const contentTypeMap: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff'
  };

  return contentTypeMap[extension.toLowerCase()] || 'image/jpeg';
}
