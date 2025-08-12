import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets, saveMediaAsset, deleteMediaAsset, type MediaAsset, type LayoutAsset } from '@/lib/media-storage';

export const dynamic = 'force-dynamic';

// GET /api/media-assets - List media assets
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const mediaType = url.searchParams.get('type') as 'image' | 'video' | 'audio' | 'layout' | null;
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
        metadata_extraction: body.media_type === 'layout' ? 'completed' : 'pending',
        ai_labeling: 'not_started',
        manual_review: 'pending',
        ...(body.media_type === 'layout' && { html_generation: 'pending' }),
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
