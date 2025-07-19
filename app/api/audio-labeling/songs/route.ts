import { NextResponse } from 'next/server';
import { listSongs } from '@/lib/song-storage';

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
