import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const dataDir = path.join(process.cwd(), 'audio-sources', 'data');
    const filePath = path.join(dataDir, `${id}.json`);

    try {
      await fs.access(filePath);
    } catch (error) {
      return NextResponse.json(
        { error: 'Song not found' },
        { status: 404 }
      );
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const songData = JSON.parse(content);

    return NextResponse.json(songData);
  } catch (error) {
    console.error('Error fetching song:', error);
    return NextResponse.json(
      { error: 'Failed to fetch song' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const updates = await request.json();

    const dataDir = path.join(process.cwd(), 'audio-sources', 'data');
    const filePath = path.join(dataDir, `${id}.json`);

    try {
      await fs.access(filePath);
    } catch (error) {
      return NextResponse.json(
        { error: 'Song not found' },
        { status: 404 }
      );
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const songData = JSON.parse(content);

    // Update manual labels
    if (updates.manual_labels) {
      songData.manual_labels = {
        ...songData.manual_labels,
        ...updates.manual_labels
      };
    }

    // Update core song data (title, prompt, lyrics)
    if (updates.title !== undefined) {
      songData.title = updates.title;
    }
    if (updates.prompt !== undefined) {
      songData.prompt = updates.prompt;
    }
    if (updates.lyrics !== undefined) {
      songData.lyrics = updates.lyrics;
    }

    songData.updated_at = new Date().toISOString();

    // Enhanced completion checking with new data structure - with safe null checks
    const labels = songData.manual_labels || {};
    const hasBasicLabels =
      labels.primary_genre &&
      labels.vocals &&
      labels.energy_level > 0 &&
      labels.emotional_intensity > 0 &&
      labels.tempo > 0;

    const hasStyles = (labels.styles && labels.styles.length > 0) ||
                     (labels.custom_styles && labels.custom_styles.length > 0);

    const hasMoods = (labels.mood && labels.mood.length > 0) ||
                    (labels.custom_moods && labels.custom_moods.length > 0);

    const hasThemes = (labels.themes && labels.themes.length > 0) ||
                     (labels.custom_themes && labels.custom_themes.length > 0);

    songData.labeling_complete = hasBasicLabels && hasStyles && hasMoods && hasThemes;

    await fs.writeFile(filePath, JSON.stringify(songData, null, 2));

    return NextResponse.json(songData);
  } catch (error) {
    console.error('Error updating song:', error);
    return NextResponse.json(
      { error: 'Failed to update song' },
      { status: 500 }
    );
  }
}
