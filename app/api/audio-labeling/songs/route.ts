import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'audio-sources', 'data');

    try {
      // Check if data directory exists
      await fs.access(dataDir);
    } catch (error) {
      // Directory doesn't exist, return empty array
      return NextResponse.json([]);
    }

    // Read all JSON files in the data directory
    const files = await fs.readdir(dataDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    const songs = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(dataDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const songData = JSON.parse(content);
        songs.push(songData);
      } catch (error) {
        console.error(`Error reading ${file}:`, error);
      }
    }

    // Sort by created_at date (newest first)
    songs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json(songs);

  } catch (error) {
    console.error('Error fetching songs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch songs' },
      { status: 500 }
    );
  }
}
