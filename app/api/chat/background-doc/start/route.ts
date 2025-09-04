import { NextRequest, NextResponse } from 'next/server';
import { createTextAsset, generateUniqueTextSlug, validateTextAsset } from '@/lib/media-storage';
import { saveMediaAsset } from '@/lib/media-storage';

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

    // Generate unique title and slug
    const timestamp = Date.now();
    const finalTitle = title || `Conversation Summary ${timestamp}`;
    const finalSlug = await generateUniqueTextSlug(slug || finalTitle);

    // Create S3 text asset for scribe
    const textAsset = createTextAsset({
      slug: finalSlug,
      title: finalTitle,
      content: `# ${finalTitle}\n\n*The scribe will populate this document as your conversation continues...*`,
      categories: ['lore', 'conversation'],
      source: 'conversation',
      status: 'draft',
      scribe_enabled: true,
      conversation_id: conversationId,
    });

    // Validate the text asset
    const errors = validateTextAsset(textAsset);
    if (errors.length > 0) {
      console.error('[background-doc] Validation failed:', errors);
      return NextResponse.json({
        error: 'Text asset validation failed',
        details: errors
      }, { status: 400 });
    }

    // Save to S3
    await saveMediaAsset(textAsset.id, textAsset);

    console.log('[background-doc] Started S3 scribe for conversation:', {
      conversationId,
      id: textAsset.id,
      slug: finalSlug,
      title: finalTitle
    });

    return NextResponse.json({
      success: true,
      id: textAsset.id,
      slug: finalSlug,
      title: finalTitle,
      conversationId,
      scribe_enabled: true,
      layoutId: null,
      layoutUrl: `/visual-search?highlight=${finalSlug}`
    });

  } catch (error) {
    console.error('[background-doc] S3 start failed:', error);
    return NextResponse.json({
      error: 'Failed to create background document',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
