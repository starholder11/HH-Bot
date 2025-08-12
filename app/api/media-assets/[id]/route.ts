import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, listMediaAssets, saveMediaAsset, deleteMediaAsset, type MediaAsset } from '@/lib/media-storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    console.log(`[media-assets] Fetching full metadata for asset: ${id}`);

    // Get the complete asset data from S3 JSON storage
    let asset = await getMediaAsset(id);

    // Optional fallback: if not found by id, try to resolve by URL hint
    if (!asset) {
      const urlHint = new URL(request.url).searchParams.get('url');
      if (urlHint) {
        try {
          const normalize = (u?: string) => {
            if (!u) return '';
            try {
              const url = new URL(u);
              return url.pathname.split('/').pop() || u; // filename portion
            } catch {
              // not a URL, return last segment
              const parts = u.split('?')[0].split('/');
              return parts[parts.length - 1] || u;
            }
          };

          const hintFilename = normalize(urlHint);

          // Load all audio assets to improve hit rate while keeping scope tight
          const { assets } = await listMediaAssets('audio', { loadAll: true, excludeKeyframes: false });

          asset = assets.find((a: any) => {
            const aS3 = a?.s3_url as string | undefined;
            const aCdn = a?.cloudflare_url as string | undefined;
            if (aS3 === urlHint || aCdn === urlHint) return true;
            const aS3File = normalize(aS3);
            const aCdnFile = normalize(aCdn);
            const aFilename = (a?.filename as string | undefined) || '';
            return (
              aS3File === hintFilename ||
              aCdnFile === hintFilename ||
              aFilename === hintFilename
            );
          }) || null;
        } catch (fallbackErr) {
          console.warn('[media-assets] URL fallback failed:', fallbackErr);
        }
      }
    }

    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    console.log(`[media-assets] Found asset: ${asset.title} (${asset.media_type})`);

    // Return the complete asset with all metadata, AI labels, manual labels, etc.
    return NextResponse.json({
      success: true,
      asset
    });

  } catch (error) {
    console.error('[media-assets] Error fetching asset:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch asset metadata',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT /api/media-assets/[id] - Update a specific media asset
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    // Get the existing asset
    const existingAsset = await getMediaAsset(id);
    if (!existingAsset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    // Update the asset
    const now = new Date().toISOString();
    const updatedAsset: MediaAsset = {
      ...existingAsset,
      ...body,
      id, // Ensure ID doesn't change
      created_at: existingAsset.created_at, // Preserve creation time
      updated_at: now
    };

    await saveMediaAsset(id, updatedAsset);

    console.log(`[media-assets] Updated asset: ${id} (${updatedAsset.media_type})`);

    return NextResponse.json({
      success: true,
      asset: updatedAsset,
      message: 'Asset updated successfully'
    });

  } catch (error) {
    console.error('[media-assets] Error updating asset:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update asset',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE /api/media-assets/[id] - Delete a specific media asset
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    const deleted = await deleteMediaAsset(id);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    console.log(`[media-assets] Deleted asset: ${id}`);

    return NextResponse.json({
      success: true,
      message: 'Asset deleted successfully'
    });

  } catch (error) {
    console.error('[media-assets] Error deleting asset:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete asset',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
