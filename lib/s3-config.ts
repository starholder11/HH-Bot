import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

// Helper function to get S3 client at runtime
function getS3Client(): S3Client {
  const credsProvided = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    // Only pass an explicit credentials object if both variables are defined.
    // Otherwise rely on the AWS SDK default provider chain (shared credentials
    // file, IAM role, etc.).
    ...(credsProvided
      ? {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        }
      : {}),
  });
}

// Helper function to get bucket name at runtime
function getBucketName(): string {
  const bucketName = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;
  if (!bucketName) {
    throw new Error('S3_BUCKET_NAME environment variable is not set');
  }
  return bucketName;
}

const CLOUDFLARE_DOMAIN = process.env.CLOUDFLARE_DOMAIN || 'cdn.yourdomain.com';

export interface UploadResult {
  s3_url: string;
  cloudflare_url: string;
  key: string;
}

export async function uploadAudioToS3(
  file: File,
  filename?: string
): Promise<UploadResult> {
  const BUCKET_NAME = getBucketName(); // Get bucket name dynamically
  const s3Client = getS3Client(); // Get S3 client dynamically

  const key = filename || `audio/${Date.now()}-${file.name}`;

  try {
    // Convert File to Buffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type || 'audio/mpeg',
        CacheControl: 'max-age=31536000', // 1 year cache
      },
    });

    const result = await upload.done();

    const s3_url = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
    const cloudflare_url = `https://${CLOUDFLARE_DOMAIN}/${key}`;

    return {
      s3_url,
      cloudflare_url,
      key,
    };
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw new Error(`Failed to upload ${file.name} to S3`);
  }
}

export async function uploadCoverArtToS3(
  file: File,
  songId: string
): Promise<UploadResult> {
  const BUCKET_NAME = getBucketName(); // Get bucket name dynamically
  const s3Client = getS3Client(); // Get S3 client dynamically

  const extension = file.name.split('.').pop();
  const key = `cover-art/${songId}.${extension}`;

  try {
    // Convert File to Buffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type || 'image/jpeg',
        CacheControl: 'max-age=31536000', // 1 year cache
      },
    });

    const result = await upload.done();

    const s3_url = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
    const cloudflare_url = `https://${CLOUDFLARE_DOMAIN}/${key}`;

    return {
      s3_url,
      cloudflare_url,
      key,
    };
  } catch (error) {
    console.error('Error uploading cover art to S3:', error);
    throw new Error(`Failed to upload cover art for ${songId} to S3`);
  }
}

export async function uploadFileToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<UploadResult> {
  const BUCKET_NAME = getBucketName(); // Get bucket name dynamically
  const s3Client = getS3Client(); // Get S3 client dynamically

  try {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'max-age=31536000',
      },
    });

    await upload.done();

    const s3_url = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
    const cloudflare_url = `https://${CLOUDFLARE_DOMAIN}/${key}`;

    return {
      s3_url,
      cloudflare_url,
      key,
    };
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw new Error(`Failed to upload ${key} to S3`);
  }
}

// Utility function to generate a unique filename
export function generateUniqueFilename(originalName: string): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  const baseName = originalName.split('.').slice(0, -1).join('.');

  return `audio/${timestamp}-${randomSuffix}-${baseName}.${extension}`;
}

export { getS3Client, getBucketName };
