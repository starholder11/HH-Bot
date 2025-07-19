import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { uploadAudioToS3, generateUniqueFilename } from '@/lib/s3-config';
import { saveSong, listSongs } from '@/lib/song-storage';
import { extractMP3Metadata } from '@/lib/mp3-metadata';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.includes('audio/mpeg') && !file.name.toLowerCase().endsWith('.mp3')) {
      return NextResponse.json({ error: 'File must be an MP3' }, { status: 400 });
    }

    // Validate file size (100MB max)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `File size exceeds 100MB limit. File is ${(file.size / 1024 / 1024).toFixed(1)}MB`
      }, { status: 400 });
    }

    // Convert file to buffer for metadata extraction
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract metadata from MP3
    const metadata = await extractMP3Metadata(buffer, file.name);
    console.log('Extracted metadata:', metadata);

    // Check for duplicates by title
    const existingSongs = await listSongs();
    const duplicateTitle = existingSongs.find(song =>
      song.title?.toLowerCase().trim() === metadata.title?.toLowerCase().trim()
    );

    if (duplicateTitle) {
      return NextResponse.json({
        error: `A song with the title "${metadata.title}" already exists`
      }, { status: 409 });
    }

    // Upload MP3 to S3
    const uniqueFilename = generateUniqueFilename(file.name);
    console.log('Uploading to S3 with filename:', uniqueFilename);

    const uploadResult = await uploadAudioToS3(file, uniqueFilename);
    console.log('S3 upload result:', uploadResult);

    // Create new song JSON entry
    const songId = uuidv4();
    const now = new Date().toISOString();

    const songData = {
      id: songId,
      filename: file.name,
      s3_url: uploadResult.s3_url,
      cloudflare_url: uploadResult.cloudflare_url,
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
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
