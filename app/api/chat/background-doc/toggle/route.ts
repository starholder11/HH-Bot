import { NextRequest, NextResponse } from 'next/server';
import { findTextAssetBySlug, updateTextAssetContent, getMediaAsset } from '@/lib/media-storage';
import { saveMediaAsset } from '@/lib/media-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { slug, scribe_enabled, id } = await req.json();

    if (typeof scribe_enabled !== 'boolean') {
      return NextResponse.json({ error: 'scribe_enabled must be boolean' }, { status: 400 });
    }

    let textAsset;

    // Try to find by ID first (S3 text asset), then by slug (fallback)
    if (id) {
      textAsset = await getMediaAsset(id);
      if (!textAsset || textAsset.media_type !== 'text') {
        return NextResponse.json({ error: 'Text asset not found by ID' }, { status: 404 });
      }
    } else if (slug) {
      textAsset = await findTextAssetBySlug(slug);
      if (!textAsset) {
        return NextResponse.json({ error: 'Text asset not found by slug' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: 'Either id or slug is required' }, { status: 400 });
    }

    // Update scribe_enabled in metadata
    const updatedAsset = updateTextAssetContent(textAsset as any, {
      scribe_enabled
    });

    // Save updated asset to S3
    await saveMediaAsset(updatedAsset.id, updatedAsset);

    console.log('[background-doc] Toggled S3 scribe for document:', {
      id: updatedAsset.id,
      slug: updatedAsset.metadata.slug,
      scribe_enabled
    });

    return NextResponse.json({
      success: true,
      id: updatedAsset.id,
      slug: updatedAsset.metadata.slug,
      scribe_enabled,
      message: scribe_enabled ? 'Scribe activated' : 'Scribe disabled'
    });

  } catch (error) {
    console.error('[background-doc] S3 toggle failed:', error);
    return NextResponse.json({
      error: 'Failed to toggle scribe',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
