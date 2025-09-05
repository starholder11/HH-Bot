import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets, saveMediaAsset, deleteMediaAsset, type MediaAsset, isTextAsset } from '@/lib/media-storage';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { readJsonFromS3 } from '@/lib/s3-upload';
import { uploadS3TextAssetToVectorStore } from '@/lib/openai-sync';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// GET /api/media-assets - List media assets
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const mediaType = url.searchParams.get('type') as 'image' | 'video' | 'audio' | 'layout' | 'text' | null;
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const excludeKeyframes = url.searchParams.get('excludeKeyframes') === 'true';

    console.log(`[media-assets] GET - mediaType: ${mediaType}, page: ${page}, limit: ${limit}`);

    const result = await listMediaAssets(mediaType || undefined, {
      page,
      limit,
      excludeKeyframes
    });

    return NextResponse.json({
      success: true,
      assets: result.assets,
      totalCount: result.totalCount,
      hasMore: result.hasMore,
      page,
      limit
    });

  } catch (error) {
    console.error('[media-assets] GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to list media assets',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST /api/media-assets - Create a new media asset
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id || !body.media_type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: id, media_type' },
        { status: 400 }
      );
    }

    // For layout assets, ensure required fields are present
    if (body.media_type === 'layout') {
      if (!body.layout_data || !body.layout_type) {
        return NextResponse.json(
          { success: false, error: 'Layout assets require layout_data and layout_type' },
          { status: 400 }
        );
      }
    }

    // For text assets, ensure required fields are present
    if (body.media_type === 'text') {
      if (!body.content || !body.metadata?.slug) {
        return NextResponse.json(
          { success: false, error: 'Text assets require content and metadata.slug' },
          { status: 400 }
        );
      }

      // Validate slug format (allow uppercase letters)
      if (!/^[a-zA-Z0-9-]+$/.test(body.metadata.slug)) {
        return NextResponse.json(
          { success: false, error: 'Slug must contain only letters, numbers, and dashes' },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();

    // Create the asset with proper defaults
    const asset: MediaAsset = {
      ...body,
      created_at: body.created_at || now,
      updated_at: now,
      timestamps: {
        uploaded: now,
        metadata_extracted: body.media_type === 'layout' ? now : null,
        labeled_ai: null,
        labeled_reviewed: null,
        ...(body.media_type === 'layout' && { html_generated: null }),
        ...body.timestamps
      },
      processing_status: {
        upload: 'completed',
        metadata_extraction: (body.media_type === 'layout' || body.media_type === 'text') ? 'completed' : 'pending',
        ai_labeling: 'not_started',
        manual_review: 'pending',
        ...(body.media_type === 'layout' && { html_generation: 'pending' }),
        ...(body.media_type === 'text' && {
          content_analysis: 'pending',
          search_indexing: 'pending'
        }),
        ...body.processing_status
      },
      ai_labels: body.ai_labels || {
        scenes: [],
        objects: [],
        style: [],
        mood: [],
        themes: [],
        confidence_scores: {}
      },
      manual_labels: body.manual_labels || {
        scenes: [],
        objects: [],
        style: [],
        mood: [],
        themes: [],
        custom_tags: []
      },
      labeling_complete: false,
      ...body
    };

    await saveMediaAsset(body.id, asset);

    // Sync text assets to OAI File Search for immediate lore agent visibility
    console.log(`[media-assets] Checking if asset is text asset:`, {
      mediaType: asset.media_type,
      isTextAsset: isTextAsset(asset),
      hasContent: !!(asset as any).content
    });
    
    if (isTextAsset(asset)) {
      console.log(`[media-assets] 🔥 STARTING OAI sync for text asset: ${asset.id}`);
      try {
        const vectorStoreFile = await uploadS3TextAssetToVectorStore(asset);
        console.log(`[media-assets] ✅ OAI sync completed:`, {
          assetId: asset.id,
          slug: asset.metadata.slug,
          vectorStoreFileId: (vectorStoreFile as any)?.id,
          fileName: `s3-${asset.metadata.slug}-${crypto.createHash('sha256').update(asset.content).digest('hex').slice(0, 8)}.md`
        });
      } catch (oaiError) {
        console.error(`[media-assets] ❌ OAI sync failed for text asset ${asset.id}:`, oaiError);
        console.error(`[media-assets] ❌ OAI error details:`, {
          message: oaiError instanceof Error ? oaiError.message : 'Unknown error',
          stack: oaiError instanceof Error ? oaiError.stack : 'No stack'
        });
        // Don't fail the save operation if OAI sync fails
      }
    } else {
      console.log(`[media-assets] Skipping OAI sync - not a text asset`);
    }

    // Maintain a lightweight layouts index for fast listing
    if (asset.media_type === 'layout') {
      try {
        const s3 = getS3Client();
        const bucket = getBucketName();
        const indexKey = 'layouts/index.json';

        let index: { items: Array<{ id: string; title: string; created_at: string }> } = { items: [] };
        try {
          const existing = await readJsonFromS3(indexKey);
          if (existing && Array.isArray(existing.items)) index = existing;
        } catch {}

        const entry = { id: asset.id, title: asset.title, created_at: asset.created_at };
        const pos = index.items.findIndex(i => i.id === entry.id);
        if (pos >= 0) index.items[pos] = entry; else index.items.unshift(entry);

        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: indexKey,
          Body: JSON.stringify(index, null, 2),
          ContentType: 'application/json',
          CacheControl: 'no-cache'
        }));
      } catch (e) {
        console.warn('[media-assets] Layouts index update failed (non-fatal):', e);
      }
    }

    console.log(`[media-assets] Created ${body.media_type} asset: ${body.id}`);

    return NextResponse.json({
      success: true,
      asset,
      message: 'Asset created successfully'
    });

  } catch (error) {
    console.error('[media-assets] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create media asset',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT /api/media-assets - Update an existing media asset
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Update the asset with new timestamp
    const asset: MediaAsset = {
      ...body,
      updated_at: now
    };

    await saveMediaAsset(body.id, asset);

    // Sync text assets to OAI File Search for immediate lore agent visibility
    if (isTextAsset(asset)) {
      try {
        console.log(`[media-assets] Syncing updated text asset to OAI vector store: ${asset.id}`);
        const vectorStoreFile = await uploadS3TextAssetToVectorStore(asset);
        console.log(`[media-assets] OAI update sync completed:`, {
          assetId: asset.id,
          slug: asset.metadata.slug,
          vectorStoreFileId: (vectorStoreFile as any)?.id
        });
      } catch (oaiError) {
        console.warn(`[media-assets] OAI sync failed for updated text asset ${asset.id} (non-blocking):`, oaiError);
        // Don't fail the update operation if OAI sync fails
      }
    }

    console.log(`[media-assets] Updated ${body.media_type} asset: ${body.id}`);

    return NextResponse.json({
      success: true,
      asset,
      message: 'Asset updated successfully'
    });

  } catch (error) {
    console.error('[media-assets] PUT error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update media asset',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE /api/media-assets - Delete a media asset
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    const deleted = await deleteMediaAsset(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    console.log(`[media-assets] Deleted asset: ${id}`);

    return NextResponse.json({
      success: true,
      message: 'Asset deleted successfully'
    });

  } catch (error) {
    console.error('[media-assets] DELETE error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete media asset',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
