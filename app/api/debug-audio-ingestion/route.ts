import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { songId } = await request.json();
    
    if (!songId) {
      return NextResponse.json({ error: 'songId is required' }, { status: 400 });
    }

    console.log('🔍 DEBUG: Starting manual audio ingestion for', songId);

    // Get the song data
    const { getSong } = await import('@/lib/song-storage');
    const songData = await getSong(songId);
    
    if (!songData) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    console.log('🔍 DEBUG: Song data loaded:', {
      id: songData.id,
      title: songData.title,
      hasLyrics: !!songData.lyrics,
      hasPrompt: !!songData.prompt,
      lyricsLength: songData.lyrics?.length || 0,
      promptLength: songData.prompt?.length || 0,
      lyrics: songData.lyrics,
      prompt: songData.prompt
    });

    // Convert to MediaAsset
    const { convertSongToAudioAsset } = await import('@/lib/media-storage');
    const mediaAsset = convertSongToAudioAsset(songData);

    console.log('🔍 DEBUG: MediaAsset created:', {
      id: mediaAsset.id,
      title: mediaAsset.title,
      hasLyrics: !!mediaAsset.lyrics,
      hasPrompt: !!mediaAsset.prompt,
      lyricsLength: mediaAsset.lyrics?.length || 0,
      promptLength: mediaAsset.prompt?.length || 0,
      lyrics: mediaAsset.lyrics,
      prompt: mediaAsset.prompt
    });

    // Ingest to LanceDB
    const { ingestAsset } = await import('@/lib/ingestion');
    await ingestAsset(mediaAsset, true); // true = upsert

    console.log('✅ DEBUG: Ingestion completed successfully');

    return NextResponse.json({
      success: true,
      songData: {
        id: songData.id,
        title: songData.title,
        lyrics: songData.lyrics,
        prompt: songData.prompt
      },
      mediaAsset: {
        id: mediaAsset.id,
        title: mediaAsset.title,
        lyrics: mediaAsset.lyrics,
        prompt: mediaAsset.prompt
      }
    });

  } catch (error) {
    console.error('❌ DEBUG: Manual ingestion failed:', error);
    return NextResponse.json({
      error: 'Ingestion failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
