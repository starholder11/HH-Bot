import { NextRequest, NextResponse } from 'next/server';
import { getSong, saveSong } from '@/lib/song-storage';

// Ensure Node runtime so OpenAI SDK + server-side ingestion work reliably (not Edge)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const songData = await getSong(id);
    if (!songData) {
      return NextResponse.json(
        { error: 'Song not found' },
        { status: 404 }
      );
    }

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

    const songData = await getSong(id);
    if (!songData) {
      return NextResponse.json(
        { error: 'Song not found' },
        { status: 404 }
      );
    }

    // Update manual labels
    if (updates.manual_labels) {
      songData.manual_labels = {
        ...songData.manual_labels,
        ...updates.manual_labels
      };
    }

    // Update core song data (title, prompt, lyrics, project_id)
    if (updates.title !== undefined) {
      songData.title = updates.title;
    }
    if (updates.prompt !== undefined) {
      songData.prompt = updates.prompt;
    }
    if (updates.lyrics !== undefined) {
      songData.lyrics = updates.lyrics;
    }
    if (updates.project_id !== undefined) {
      songData.project_id = updates.project_id;
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

    await saveSong(id, songData);

    // Use SQS worker for upsert (has latest deduplication logic) 
    try {
      const { enqueueAnalysisJob } = await import('@/lib/queue');
      await enqueueAnalysisJob({
        assetId: id,
        mediaType: 'audio',
        requestedAt: Date.now(),
        stage: 'refresh'
      });
      console.log('📤 Enqueued audio PATCH refresh job for', id);
    } catch (err) {
      console.error('Failed to enqueue audio refresh job', err);
    }

    return NextResponse.json(songData);
  } catch (error) {
    console.error('Error updating song:', error);
    const message = (error as Error)?.message || 'Failed to update song';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
