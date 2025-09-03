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

    // Import and call the text-assets handler directly (same process, no HTTP)
    const { POST: textAssetsHandler } = await import('../../text-assets/route');
    const mockRequest = {
      json: async () => textAssetPayload
    } as NextRequest;

    const textAssetResponse = await textAssetsHandler(mockRequest);
    const textAssetResult = await textAssetResponse.json();

    if (!textAssetResponse.ok || !textAssetResult.success) {
      console.error('[background-doc] Text asset creation failed:', textAssetResult);
      return NextResponse.json({ 
        error: 'Failed to create text asset', 
        details: textAssetResult.error || 'Unknown error' 
      }, { status: 500 });
    }

    console.log('[background-doc] Started scribe for conversation:', { conversationId, slug: finalSlug, title: finalTitle });

    return NextResponse.json({
      success: true,
      slug: finalSlug,
      title: finalTitle,
      conversationId,
      scribe_enabled: true
    });

  } catch (error) {
    console.error('[background-doc] Start failed:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
