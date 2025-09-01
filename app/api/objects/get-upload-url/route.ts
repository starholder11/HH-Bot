import { NextRequest, NextResponse } from 'next/server';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from '@/lib/s3-config';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB for models
const ALLOWED_EXTENSIONS = ['.glb', '.gltf', '.obj', '.fbx'];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, fileSize, projectId } = body;

    if (!filename || !fileSize) {
      return NextResponse.json({ error: 'filename and fileSize are required' }, { status: 400 });
    }

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File must be <= ${MAX_FILE_SIZE / (1024 * 1024)}MB` }, { status: 400 });
    }

    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `Unsupported model type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` }, { status: 400 });
    }

    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `models/${ts}-${rand}-${safe}`;

    const s3 = getS3Client();
    const bucket = getBucketName();

    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: ext === '.glb' ? 'model/gltf-binary' : ext === '.gltf' ? 'model/gltf+json' : 'application/octet-stream',
      ContentLength: fileSize,
      Metadata: projectId ? { 'project-id': String(projectId) } : undefined,
      CacheControl: 'max-age=31536000'
    });

    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    const s3Url = `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
    const cloudflareUrl = `https://${process.env.CLOUDFLARE_DOMAIN || process.env.AWS_CLOUDFRONT_DOMAIN}/${encodedKey}`;

    return NextResponse.json({ uploadUrl, key, s3Url, cloudflareUrl, maxFileSize: MAX_FILE_SIZE });
  } catch (error) {
    console.error('[objects/get-upload-url] error', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
