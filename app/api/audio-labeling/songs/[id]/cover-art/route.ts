import { NextRequest, NextResponse } from 'next/server';
import { uploadCoverArtToS3 } from '@/lib/s3-config';
import { getSong, saveSong } from '@/lib/song-storage';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const formData = await request.formData();
    const coverArtFile = formData.get('coverArt') as File;

    if (!coverArtFile) {
      return NextResponse.json(
        { error: 'No cover art file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!coverArtFile.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Load existing song data
    const songData = await getSong(id);
    if (!songData) {
      return NextResponse.json(
        { error: 'Song not found' },
        { status: 404 }
      );
    }

    // Upload cover art to S3
    const coverArtResult = await uploadCoverArtToS3(coverArtFile, id);

    // Update song data with cover art info
    songData.cover_art = coverArtResult;
    songData.updated_at = new Date().toISOString();

    // Persist
    await saveSong(id, songData);

    return NextResponse.json({
      success: true,
      cover_art: coverArtResult
    });

  } catch (error) {
    console.error('Error uploading cover art:', error);
    return NextResponse.json(
      { error: 'Failed to upload cover art' },
      { status: 500 }
    );
  }
}
