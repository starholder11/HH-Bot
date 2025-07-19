import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { listSongs } from '@/lib/song-storage';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(request: NextRequest) {
  try {
    const { filename, fileSize, title } = await request.json();

    if (!filename || !fileSize) {
      return NextResponse.json({ error: 'Filename and file size required' }, { status: 400 });
    }

    // Validate file type
    if (!filename.toLowerCase().endsWith('.mp3')) {
      return NextResponse.json({ error: 'File must be an MP3' }, { status: 400 });
    }

    // Validate file size (100MB max)
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `File size exceeds 100MB limit. File is ${(fileSize / 1024 / 1024).toFixed(1)}MB`
      }, { status: 400 });
    }

    // Check for duplicates by title (if provided)
    if (title) {
      const existingSongs = await listSongs();
      const duplicateTitle = existingSongs.find(song =>
        song.title?.toLowerCase().trim() === title.toLowerCase().trim()
      );

      if (duplicateTitle) {
        return NextResponse.json({
          error: `A song with the title "${title}" already exists`
        }, { status: 409 });
      }
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 6);
    const uniqueFilename = `audio/${timestamp}-${randomId}-${filename}`;

    // Generate presigned URL for S3 upload
    const s3Client = getS3Client();
    const bucketName = getBucketName();

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueFilename,
      ContentType: 'audio/mpeg',
      CacheControl: 'max-age=31536000', // 1 year
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 }); // 10 minutes

    // Generate the final URLs
    const s3Url = `https://${bucketName}.s3.amazonaws.com/${encodeURIComponent(uniqueFilename)}`;
    const cloudflareUrl = `https://${process.env.CLOUDFLARE_DOMAIN || process.env.AWS_CLOUDFRONT_DOMAIN}/${encodeURIComponent(uniqueFilename)}`;

    return NextResponse.json({
      uploadUrl: presignedUrl,
      s3Url,
      cloudflareUrl,
      key: uniqueFilename
    });

  } catch (error) {
    console.error('Presigned URL generation error:', error);
    return NextResponse.json(
      { error: `Failed to generate upload URL: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
