import { NextResponse } from 'next/server';
import { listSongs } from '@/lib/song-storage';
import { saveSong } from '@/lib/song-storage';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const songs = await listSongs();
    return NextResponse.json(songs);
  } catch (error) {
    console.error('Error fetching songs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch songs' },
      { status: 500 }
    );
  }
}

// Create a new song record (expects full song JSON in body)
export async function POST(request: Request) {
  try {
    const songData = await request.json();
    if (!songData.id) {
      return NextResponse.json({ error: 'id field required' }, { status: 400 });
    }

    await saveSong(songData.id, songData);
    return NextResponse.json(songData);
  } catch (error) {
    console.error('Error creating song:', error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to create song' }, { status: 500 });
  }
}
