import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { saveSong } from '@/lib/song-storage';
import { extractMP3Metadata } from '@/lib/mp3-metadata';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// Helper function to verify S3 object exists and is readable
async function verifyS3ObjectExists(s3Client: any, bucketName: string, key: string, maxRetries: number = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[S3 verification] Attempt ${attempt}/${maxRetries} for key: ${key}`);
      await s3Client.send(new HeadObjectCommand({
        Bucket: bucketName,
        Key: key
      }));
      console.log(`[S3 verification] Success - object exists and is readable: ${key}`);
      return true;
    } catch (error: any) {
      console.log(`[S3 verification] Attempt ${attempt} failed for ${key}:`, error.name);

      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1s, 2s
        const delay = 500 * Math.pow(2, attempt - 1);
        console.log(`[S3 verification] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`[S3 verification] All ${maxRetries} attempts failed for ${key}`);
        return false;
      }
    }
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const { s3Url, cloudflareUrl, key, originalFilename } = await request.json();

    if (!s3Url || !cloudflareUrl || !key || !originalFilename) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    console.log('Completing upload for:', originalFilename, 'with key:', key);

    // Download the file from S3 to extract metadata
    const s3Client = getS3Client();
    const bucketName = getBucketName();

    // Verify the S3 object exists and is readable before attempting download
    const isS3ObjectReady = await verifyS3ObjectExists(s3Client, bucketName, key);

    if (!isS3ObjectReady) {
      console.error('S3 object not ready after retries. File may not be fully uploaded yet.');
      return NextResponse.json({
        error: 'File not ready for processing yet. Please try again in a few seconds.'
      }, { status: 503 }); // Service Temporarily Unavailable
    }

    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    // Get the file from S3
    const response = await s3Client.send(getObjectCommand);
    if (!response.Body) {
      throw new Error('Failed to download file from S3 for metadata extraction');
    }

    // Convert stream to buffer for metadata extraction
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);

    // Extract metadata from MP3
    const metadata = await extractMP3Metadata(buffer, originalFilename);
    console.log('Extracted metadata:', metadata);

    // Create new song JSON entry
    const songId = uuidv4();
    const now = new Date().toISOString();

    const songData = {
      id: songId,
      filename: originalFilename,
      s3_url: s3Url,
      cloudflare_url: cloudflareUrl,
      title: metadata.title || 'Untitled',
      prompt: '',
      lyrics: '',

      // Store extracted metadata for reference
      metadata: {
        artist: metadata.artist,
        album: metadata.album,
        year: metadata.year,
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        format: metadata.format,
      },

      // Empty auto_analysis structure (no auto-analysis per requirements)
      auto_analysis: {
        enhanced_analysis: {
          primary_genre: '',
          styles: [],
          energy_level: 5,
          emotional_intensity: 5,
          mood: [],
          themes: [],
          vocals: 'none',
          word_count: 0,
          sentiment_score: 0,
          prompt: [],
          temporal_structure: []
        },
        content_type: 'Audio',
        word_count: 0,
        sentiment_score: 0
      },

      // Default manual_labels structure
      manual_labels: {
        primary_genre: '',
        styles: [],
        energy_level: 5,
        emotional_intensity: 5,
        mood: [],
        themes: [],
        tempo: 5,
        vocals: 'none',
        language: 'english',
        explicit: false,
        instrumental: false,
        custom_styles: [],
        custom_moods: [],
        custom_themes: []
      },

      created_at: now,
      updated_at: now,
      labeling_complete: false
    };

    // Save song JSON
    await saveSong(songId, songData);
    console.log('Saved song data for:', songData.title);

    return NextResponse.json({
      success: true,
      song: songData,
      message: `Successfully uploaded "${metadata.title}"`
    });

  } catch (error) {
    console.error('Upload completion error:', error);
    return NextResponse.json(
      { error: `Upload completion failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
