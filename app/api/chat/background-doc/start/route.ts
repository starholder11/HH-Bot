import { NextRequest, NextResponse } from 'next/server';

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
    
    // Create text asset with scribe enabled
    const response = await fetch('/api/text-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: finalSlug,
        title: finalTitle,
        source: 'conversation',
        status: 'draft',
        scribe_enabled: true,
        conversation_id: conversationId,
        mdx: `# ${finalTitle}\n\n*The scribe will populate this document as your conversation continues...*`,
        commitOnSave: false
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: 'Failed to create text asset', details: error }, { status: 500 });
    }
    
    const result = await response.json();
    
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
