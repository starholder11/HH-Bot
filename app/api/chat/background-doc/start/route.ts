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

        // Create text asset directly (avoid server-side fetch)
    const baseDir = path.join(process.cwd(), 'content', 'timeline', finalSlug);
    const indexPath = path.join(baseDir, 'index.yaml');
    const contentPath = path.join(baseDir, 'content.mdx');

    const indexDoc = {
      slug: finalSlug,
      title: finalTitle,
      date: new Date().toISOString(),
      categories: [],
      source: 'conversation',
      status: 'draft',
      scribe_enabled: true,
      conversation_id: conversationId
    };

    const indexYaml = yaml.dump(indexDoc, { noRefs: true });
    const mdxContent = `# ${finalTitle}\n\n*The scribe will populate this document as your conversation continues...*`;

    // Write files to disk
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    fs.writeFileSync(indexPath, indexYaml, 'utf-8');
    fs.writeFileSync(contentPath, mdxContent, 'utf-8');

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
