import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
// NOTE: sharp is loaded dynamically inside processImage to avoid optional dependency errors
import { fileTypeFromBuffer } from 'file-type';

// AWS S3 Client Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Configuration
const BUCKET_NAME = process.env.AWS_S3_BUCKET!;
const CLOUDFRONT_DOMAIN = process.env.AWS_CLOUDFRONT_DOMAIN!;

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  contentType: string;
}

export interface ImageUploadOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

/**
 * Process and optimize image using Sharp
 */
async function processImage(
  buffer: Buffer,
  options: ImageUploadOptions = {}
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  console.log('🖼️ Starting Sharp image processing...');
  
  const {
    quality = 85,
    maxWidth = 1920,
    maxHeight = 1080,
    format = 'jpeg'
  } = options;

  console.log('⚙️ Processing options:', { quality, maxWidth, maxHeight, format });

  // Dynamically import sharp so the lambda still works when the
  // optional native module isn\'t present (e.g. Vercel x64 targets)
  let sharpLib: typeof import('sharp');
  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    sharpLib = (await import('sharp')).default;
  } catch (err) {
    console.warn('⚠️  sharp module not available – skipping optimisation');
    // Return original buffer unchanged; guess mime from extension
    return {
      buffer,
      contentType: 'image/jpeg',
      extension: 'jpg'
    };
  }

  let sharpInstance = sharpLib(buffer);

  // Resize if needed
  console.log('📏 Getting image metadata...');
  const metadata = await sharpInstance.metadata();
  console.log('📊 Image metadata:', metadata);
  
  if (metadata.width && metadata.height) {
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      console.log('📏 Resizing image from', metadata.width, 'x', metadata.height, 'to max', maxWidth, 'x', maxHeight);
      sharpInstance = sharpInstance.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    } else {
      console.log('📏 Image size OK, no resizing needed');
    }
  }

  // Convert to specified format
  let processedBuffer: Buffer;
  let contentType: string;
  let extension: string;

  switch (format) {
    case 'png':
      processedBuffer = await sharpInstance.png().toBuffer();
      contentType = 'image/png';
      extension = 'png';
      break;
    case 'webp':
      processedBuffer = await sharpInstance.webp({ quality }).toBuffer();
      contentType = 'image/webp';
      extension = 'webp';
      break;
    case 'jpeg':
    default:
      processedBuffer = await sharpInstance.jpeg({ quality }).toBuffer();
      contentType = 'image/jpeg';
      extension = 'jpg';
      break;
  }

  return { buffer: processedBuffer, contentType, extension };
}

/**
 * Generate unique S3 key for file
 */
function generateS3Key(
  originalName: string,
  extension: string,
  prefix: string = 'uploads'
): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const sanitizedName = originalName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .toLowerCase();
  
  return `${prefix}/${timestamp}-${randomId}-${sanitizedName}.${extension}`;
}

/**
 * Upload file to S3
 */
async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string,
  metadata: Record<string, string> = {}
): Promise<void> {
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
      CacheControl: 'public, max-age=31536000', // 1 year cache
    },
  });

  await upload.done();
}

/**
 * Generate CloudFront URL from S3 key
 */
function generateCloudFrontUrl(key: string): string {
  return `https://${CLOUDFRONT_DOMAIN}/${key}`;
}

/**
 * Main upload function for images
 */
export async function uploadImage(
  file: File | Buffer,
  options: ImageUploadOptions = {}
): Promise<UploadResult> {
  try {
    console.log('🖼️ Starting S3 image upload process...');
    console.log('📊 Input file type:', file instanceof File ? 'File' : 'Buffer');
    
    // Convert File to Buffer if needed
    let buffer: Buffer;
    let originalName: string;

    if (file instanceof File) {
      buffer = Buffer.from(await file.arrayBuffer());
      originalName = file.name;
      console.log('📊 File name:', originalName);
    } else {
      buffer = file;
      originalName = 'image';
      console.log('📊 Buffer input, using default name');
    }

    console.log('📊 Buffer size:', buffer.length, 'bytes');
    console.log('📊 First 16 bytes (hex):', buffer.slice(0, 16).toString('hex'));

    // Detect file type
    console.log('🔍 Detecting file type...');
    const fileType = await fileTypeFromBuffer(buffer);
    console.log('📋 Detected file type:', fileType);
    
    if (!fileType || !fileType.mime.startsWith('image/')) {
      console.error('❌ Invalid file type detected:', fileType);
      throw new Error('Invalid image file');
    }
    
    console.log('✅ Valid image file detected:', fileType.mime);

    // Process image
    const { buffer: processedBuffer, contentType, extension } = await processImage(
      buffer,
      options
    );

    // Generate S3 key
    const key = generateS3Key(originalName, extension, 'images');

    // Upload to S3
    await uploadToS3(processedBuffer, key, contentType, {
      originalName,
      processedAt: new Date().toISOString(),
    });

    // Generate CloudFront URL
    const url = generateCloudFrontUrl(key);

    return {
      url,
      key,
      size: processedBuffer.length,
      contentType,
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Upload function for general files
 */
export async function uploadFile(
  file: File | Buffer,
  prefix: string = 'files'
): Promise<UploadResult> {
  try {
    // Convert File to Buffer if needed
    let buffer: Buffer;
    let originalName: string;

    if (file instanceof File) {
      buffer = Buffer.from(await file.arrayBuffer());
      originalName = file.name;
    } else {
      buffer = file;
      originalName = 'file';
    }

    // Detect file type
    const fileType = await fileTypeFromBuffer(buffer);
    const contentType = fileType?.mime || 'application/octet-stream';
    const extension = fileType?.ext || 'bin';

    // Generate S3 key
    const key = generateS3Key(originalName, extension, prefix);

    // Upload to S3
    await uploadToS3(buffer, key, contentType, {
      originalName,
      uploadedAt: new Date().toISOString(),
    });

    // Generate CloudFront URL
    const url = generateCloudFrontUrl(key);

    return {
      url,
      key,
      size: buffer.length,
      contentType,
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    
    // Note: This is a placeholder. For actual deletion, you'd use DeleteObjectCommand
    // but we're keeping files for now to avoid breaking references
    console.log(`Would delete file: ${key}`);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
} 