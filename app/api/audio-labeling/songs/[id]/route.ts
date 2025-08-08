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

    // DIAGNOSTICS: log current state and incoming updates (redacted to lengths)
    console.log('[audio-patch] BEFORE', {
      id,
      hasPrompt: !!songData.prompt,
      promptLen: typeof songData.prompt === 'string' ? songData.prompt.length : 0,
      hasLyrics: !!songData.lyrics,
      lyricsLen: typeof songData.lyrics === 'string' ? songData.lyrics.length : 0,
      title: songData.title,
    });
    console.log('[audio-patch] UPDATES', {
      keys: Object.keys(updates || {}),
      title: updates?.title,
      hasPrompt: typeof updates?.prompt === 'string' ? updates.prompt.length : updates?.prompt,
      hasLyrics: typeof updates?.lyrics === 'string' ? updates.lyrics.length : updates?.lyrics,
      project_id: updates?.project_id,
      manual_labels_present: !!updates?.manual_labels,
    });

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
    // Prompt: ignore accidental empty-string wipes; allow explicit null to clear
    if (Object.prototype.hasOwnProperty.call(updates, 'prompt')) {
      const incoming = updates.prompt;
      if (incoming === null) {
        songData.prompt = '';
      } else if (typeof incoming === 'string') {
        const trimmed = incoming.trim();
        if (trimmed.length > 0) {
          songData.prompt = incoming;
        }
        // else ignore to preserve existing prompt
      }
    }
    // Lyrics: accept updates, but avoid setting undefined
    if (Object.prototype.hasOwnProperty.call(updates, 'lyrics')) {
      if (typeof updates.lyrics === 'string') {
        songData.lyrics = updates.lyrics;
      }
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
    console.log('[audio-patch] AFTER SAVE', {
      id,
      title: songData.title,
      hasPrompt: !!songData.prompt,
      promptLen: typeof songData.prompt === 'string' ? songData.prompt.length : 0,
      hasLyrics: !!songData.lyrics,
      lyricsLen: typeof songData.lyrics === 'string' ? songData.lyrics.length : 0,
      labeling_complete: songData.labeling_complete,
    });

    // IMMEDIATE upsert to LanceDB - use songData which already has ALL current fields
    try {
      const { convertSongToAudioAsset } = await import('@/lib/media-storage');
      const { ingestAsset } = await import('@/lib/ingestion');
      
      // songData is the complete, updated song object - use it directly
      const mediaAsset = convertSongToAudioAsset(songData);
      
      console.log('🔍 Audio PATCH ingestion with current data:', { 
        id: mediaAsset.id, 
        title: mediaAsset.title, 
        lyrics: mediaAsset.lyrics?.substring(0, 50) + '...', 
        prompt: mediaAsset.prompt?.substring(0, 50) + '...',
        hasLyrics: !!mediaAsset.lyrics, 
        hasPrompt: !!mediaAsset.prompt
      });
      
      await ingestAsset(mediaAsset, true); // true = upsert (delete existing + insert)
      console.log('✅ Audio PATCH upserted to LanceDB successfully');
    } catch (ingErr) {
      console.error('❌ Audio PATCH ingestion failed:', (ingErr as any)?.message || ingErr);
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
