import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, updateMediaAsset, deleteMediaAsset, MediaAsset, KeyframeStill } from '@/lib/media-storage';
import { getSong } from '@/lib/song-storage';
import { convertSongToAudioAsset } from '@/lib/media-storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    // First try to get as regular media asset
    let asset: MediaAsset | KeyframeStill | null = await getMediaAsset(id);

    // If not found, try to get as keyframe asset
    if (!asset) {
      const { getKeyframeAsset } = await import('@/lib/media-storage');
      asset = await getKeyframeAsset(id);
    }

    // If still not found, try audio songs store (convert to MediaAsset)
    if (!asset) {
      const song = await getSong(id);
      if (song) {
        asset = convertSongToAudioAsset(song);
      }
    }

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    return NextResponse.json(asset);

  } catch (error) {
    console.error('Error retrieving asset:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve asset' },
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

    // Validate that we're not trying to update protected fields
    const { id: assetId, created_at, ...allowedUpdates } = updates;

    const updatedAsset = await updateMediaAsset(id, allowedUpdates);

    if (!updatedAsset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

          // Enqueue refresh ingestion job so LanceDB stays in sync
      try {
        const { enqueueAnalysisJob } = await import('@/lib/queue');
        await enqueueAnalysisJob({
          assetId: updatedAsset.id,
          mediaType: updatedAsset.media_type,
          requestedAt: Date.now(),
          stage: 'refresh'
        });
      } catch (err) {
        console.error('Failed to enqueue refresh job', err);
      }

    return NextResponse.json(updatedAsset);
  } catch (error) {
    console.error('Error updating asset:', error);
    const message = (error as Error)?.message || 'Failed to update asset';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const deleted = await deleteMediaAsset(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json(
      { error: 'Failed to delete asset' },
      { status: 500 }
    );
  }
}
