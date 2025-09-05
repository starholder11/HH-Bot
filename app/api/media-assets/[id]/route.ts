import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, listMediaAssets, saveMediaAsset, deleteMediaAsset, type MediaAsset } from '@/lib/media-storage';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { readJsonFromS3 } from '@/lib/s3-upload';
import crypto from 'crypto';
import { uploadFileToVectorStore } from '@/lib/openai-sync';

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

    // Sync text assets to OAI File Search (mirror POST logic)
    try {
      const isText = (updatedAsset as any)?.media_type === 'text';
      console.log(`[media-assets/[id]] PUT - OAI check`, {
        id,
        mediaType: (updatedAsset as any)?.media_type,
        isText,
        hasContent: !!(updatedAsset as any)?.content,
      });

      if (isText) {
        console.log(`[media-assets/[id]] 🔥 STARTING OAI sync for updated text asset: ${id}`);
        const content: string = ((updatedAsset as any)?.content as string) || '';
        const slug: string = ((updatedAsset as any)?.metadata?.slug as string) || id;
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
        const vectorName = `s3-${slug}-${hash}.md`;

        console.log(`[media-assets/[id]] About to call uploadFileToVectorStore`, {
          contentLength: content.length,
          vectorName,
          slug,
        });

        const vectorStoreFile = await uploadFileToVectorStore(content, vectorName);
        console.log(`[media-assets/[id]] ✅ OAI update sync completed`, {
          assetId: id,
          slug,
          vectorStoreFileId: (vectorStoreFile as any)?.id,
          fileName: vectorName,
        });

        // Also upsert into LanceDB on update (best-effort; non-fatal)
        try {
          const { ingestText } = await import('@/lib/ingestion');
          await ingestText(id, (updatedAsset as any).title || slug, content, true);
          console.log(`[media-assets/[id]] ✅ LanceDB upserted text asset: ${id}`);
        } catch (ldErr) {
          console.warn('[media-assets/[id]] ⚠️ LanceDB upsert failed (non-fatal):', (ldErr as any)?.message || ldErr);
        }
      } else {
        console.log(`[media-assets/[id]] PUT - Skipping OAI sync (not text)`);
      }
    } catch (oaiError) {
      console.error('[media-assets/[id]] ❌ OAI sync failed on PUT:', oaiError);
      throw oaiError;
    }

    // Ensure layouts index contains this layout for fast Workshop listing
    try {
      if (updatedAsset.media_type === 'layout') {
        const s3 = getS3Client();
        const bucket = getBucketName();
        const indexKey = 'layouts/index.json';

        let index: { items: Array<{ id: string; title: string; created_at: string }> } = { items: [] };
        try {
          const existing = await readJsonFromS3(indexKey);
          if (existing && Array.isArray(existing.items)) index = existing;
        } catch {}

        const entry = { id: updatedAsset.id as string, title: (updatedAsset as any).title || updatedAsset.id, created_at: (updatedAsset as any).created_at || new Date().toISOString() };
        const pos = index.items.findIndex(i => i.id === entry.id);
        if (pos >= 0) index.items[pos] = entry; else index.items.unshift(entry);

        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: indexKey,
          Body: JSON.stringify(index, null, 2),
          ContentType: 'application/json',
          CacheControl: 'no-cache'
        }));
      }
    } catch (e) {
      console.warn('[media-assets] Failed to update layouts index on PUT (non-fatal):', e);
    }

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

    // Get the asset before deletion to check if it's a layout
    const existingAsset = await getMediaAsset(id);
    const isLayout = existingAsset?.media_type === 'layout';

    const deleted = await deleteMediaAsset(id);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    // Remove from layouts index if it was a layout
    if (isLayout) {
      try {
        const s3 = getS3Client();
        const bucket = getBucketName();
        const indexKey = 'layouts/index.json';

        let index: { items: Array<{ id: string; title: string; created_at: string }> } = { items: [] };
        try {
          const existing = await readJsonFromS3(indexKey);
          if (existing && Array.isArray(existing.items)) index = existing;
        } catch {}

        // Remove the deleted layout from index
        index.items = index.items.filter(item => item.id !== id);

        // Update the index
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: indexKey,
            Body: JSON.stringify(index, null, 2),
            ContentType: 'application/json',
          })
        );
        console.log(`[media-assets] Removed layout ${id} from layouts index`);
      } catch (indexErr) {
        console.warn('[media-assets] Failed to update layouts index after deletion:', indexErr);
        // Don't fail the delete operation if index update fails
      }
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
