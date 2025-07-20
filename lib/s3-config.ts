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

const CLOUDFLARE_DOMAIN = process.env.CLOUDFLARE_DOMAIN || process.env.AWS_CLOUDFRONT_DOMAIN || 'cdn.yourdomain.com';

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

    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    const s3_url = `https://${BUCKET_NAME}.s3.amazonaws.com/${encodedKey}`;
    const cloudflare_url = `https://${CLOUDFLARE_DOMAIN}/${encodedKey}`;

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

    const encodedKey2 = encodeURIComponent(key).replace(/%2F/g, '/');
    const s3_url = `https://${BUCKET_NAME}.s3.amazonaws.com/${encodedKey2}`;
    const cloudflare_url = `https://${CLOUDFLARE_DOMAIN}/${encodedKey2}`;

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

    const encodedKey3 = encodeURIComponent(key).replace(/%2F/g, '/');
    const s3_url = `https://${BUCKET_NAME}.s3.amazonaws.com/${encodedKey3}`;
    const cloudflare_url = `https://${CLOUDFLARE_DOMAIN}/${encodedKey3}`;

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

/**
 * Rename an S3 object by copying to new key and deleting old key
 */
export async function renameS3Object(
  oldKey: string,
  newFilename: string
): Promise<UploadResult> {
  const BUCKET_NAME = getBucketName();
  const s3Client = getS3Client();

  try {
    // Extract directory path and generate new key
    const pathParts = oldKey.split('/');
    const oldFilename = pathParts.pop();
    const directory = pathParts.join('/');

    // Preserve the timestamp and random ID from the old filename if present
    const oldFilenameParts = oldFilename?.match(/^(\d+-\w+-)?(.+)$/);
    const prefix = oldFilenameParts?.[1] || '';
    const newKey = directory ? `${directory}/${prefix}${newFilename}` : `${prefix}${newFilename}`;

    console.log(`Renaming S3 object from ${oldKey} to ${newKey}`);

    // Import CopyObjectCommand and DeleteObjectCommand
    const { CopyObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    // Copy object to new key
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${oldKey}`,
        Key: newKey,
        CacheControl: 'max-age=31536000',
      })
    );

    // Delete old object
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: oldKey,
      })
    );

    // Generate new URLs
    const encodedKey = encodeURIComponent(newKey).replace(/%2F/g, '/');
    const s3_url = `https://${BUCKET_NAME}.s3.amazonaws.com/${encodedKey}`;
    const cloudflare_url = `https://${CLOUDFLARE_DOMAIN}/${encodedKey}`;

    return {
      s3_url,
      cloudflare_url,
      key: newKey,
    };
  } catch (error) {
    console.error('Error renaming S3 object:', error);
    throw new Error(`Failed to rename S3 object: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
