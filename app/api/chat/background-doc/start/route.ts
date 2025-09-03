import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugify(input: string): string {
  return (input || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export async function POST(req: NextRequest) {
  try {
    const { conversationId, title, slug } = await req.json();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const finalSlug = slug || slugify(title || 'untitled-conversation');
    const finalTitle = title || 'Untitled Conversation';

            // Use the existing text-assets API for full integration (OAI sync, layout insertion, etc.)
    const textAssetPayload = {
      slug: finalSlug,
      title: finalTitle,
      source: 'conversation',
      status: 'draft',
      scribe_enabled: true,
      conversation_id: conversationId,
      mdx: `# ${finalTitle}\n\n*The scribe will populate this document as your conversation continues...*`,
      commitOnSave: false,
      categories: []
    };

        // Create text asset using HTTP call (avoid import issues)
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    
    const textAssetResponse = await fetch(`${baseUrl}/api/text-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(textAssetPayload)
    });

    if (!textAssetResponse.ok) {
      const error = await textAssetResponse.text();
      console.error('[background-doc] Text asset creation failed:', error);
      return NextResponse.json({
        error: 'Failed to create text asset',
        details: error
      }, { status: 500 });
    }

    const textAssetResult = await textAssetResponse.json();
    if (!textAssetResult.success) {
      console.error('[background-doc] Text asset creation failed:', textAssetResult);
      return NextResponse.json({
        error: 'Failed to create text asset',
        details: textAssetResult.error || 'Unknown error'
      }, { status: 500 });
    }

    // Now create a layout that contains this text asset
    const layoutTitle = `${finalTitle} - Layout`;
    
    const layoutPayload = {
      title: layoutTitle,
      description: `Layout containing the text asset: ${finalTitle}`,
      layout_data: {
        cellSize: 20,
        designSize: { width: 1200, height: 800 },
        items: [
          {
            id: `text_${Date.now()}`,
            type: 'content_ref',
            contentType: 'text',
            contentId: `text_timeline/${finalSlug}`,
            refId: `text_timeline/${finalSlug}`,
            snippet: finalTitle,
            title: finalTitle,
            x: 0,
            y: 0,
            w: 8,
            h: 6,
            nx: 0,
            ny: 0,
            nw: 8/15, // 8 columns out of 15
            nh: 6/10, // 6 rows out of 10
            transform: {}
          }
        ]
      },
      updated_at: new Date().toISOString()
    };

    // Create layout using HTTP call
    const layoutResponse = await fetch(`${baseUrl}/api/layouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layoutPayload)
    });

    let layoutResult = { success: false, id: null };
    if (layoutResponse.ok) {
      layoutResult = await layoutResponse.json();
    } else {
      console.warn('[background-doc] Layout creation failed, but text asset created');
    }

    console.log('[background-doc] Started scribe for conversation:', {
      conversationId,
      slug: finalSlug,
      title: finalTitle,
      layoutId: layoutResult.id,
      textAssetPaths: textAssetResult.paths
    });

    return NextResponse.json({
      success: true,
      slug: finalSlug,
      title: finalTitle,
      conversationId,
      scribe_enabled: true,
      layoutId: layoutResult.id,
      layoutUrl: layoutResult.id ? `/layout-editor/visual-search?id=${layoutResult.id}` : null
    });

  } catch (error) {
    console.error('[background-doc] Start failed:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
