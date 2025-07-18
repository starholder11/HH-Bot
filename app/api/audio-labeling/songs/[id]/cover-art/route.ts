import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { uploadCoverArtToS3 } from '@/lib/s3-config';

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

    const dataDir = path.join(process.cwd(), 'audio-sources', 'data');
    const filePath = path.join(dataDir, `${id}.json`);

    // Check if song exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return NextResponse.json(
        { error: 'Song not found' },
        { status: 404 }
      );
    }

    // Read existing song data
    const content = await fs.readFile(filePath, 'utf-8');
    const songData = JSON.parse(content);

    // Upload cover art to S3
    const coverArtResult = await uploadCoverArtToS3(coverArtFile, id);

    // Update song data with cover art info
    songData.cover_art = coverArtResult;
    songData.updated_at = new Date().toISOString();

    // Write updated data back to file
    await fs.writeFile(filePath, JSON.stringify(songData, null, 2));

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
