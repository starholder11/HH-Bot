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

    // Assemble index.yaml structure
    const indexDoc = {
      slug: finalSlug,
      title: finalTitle,
      date: new Date().toISOString(),
      categories: [],
      source: 'conversation',
      status: 'draft',
      scribe_enabled: true,
      conversation_id: conversationId
    } as const;

    const indexYaml = yaml.dump(indexDoc, { noRefs: true });
    const mdxContent = `# ${finalTitle}\n\n*The scribe will populate this document as your conversation continues...*`;

    const isReadOnly = !!process.env.VERCEL;

    if (isReadOnly) {
      // Serverless: enqueue draft via agentic backend (no direct server-to-server calls within Vercel)
      let enqueued = false;
      try {
        const agenticUrl = process.env.AGENT_BACKEND_URL || process.env.LANCEDB_API_URL;
        if (agenticUrl) {
          const response = (await Promise.race([
            fetch(`${agenticUrl}/api/text-assets/enqueue`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                slug: finalSlug,
                indexYaml,
                mdx: mdxContent,
                scribe_enabled: true,
                conversation_id: conversationId
              })
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('agentic-timeout')), 1500))
          ])) as Response;

          if (response.ok) {
            const result = await response.json();
            enqueued = !!result.enqueued;
          } else {
            console.warn('[background-doc] Agent backend enqueue returned non-OK status');
          }
        } else {
          console.warn('[background-doc] No AGENT_BACKEND_URL configured; cannot enqueue draft');
        }
      } catch (err) {
        console.warn('[background-doc] Agent backend enqueue failed (non-blocking):', (err as Error)?.message || err);
      }

      console.log('[background-doc] Started scribe (serverless) for conversation:', {
        conversationId,
        slug: finalSlug,
        title: finalTitle,
        enqueued
      });

      return NextResponse.json({
        success: true,
        slug: finalSlug,
        title: finalTitle,
        conversationId,
        scribe_enabled: true,
        layoutId: null,
        layoutUrl: `/visual-search?highlight=${finalSlug}`
      });
    }

    // Local/dev: write files directly
    const baseDir = path.join(process.cwd(), 'content', 'timeline', finalSlug);
    const indexPath = path.join(baseDir, 'index.yaml');
    const contentPath = path.join(baseDir, 'content.mdx');

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    fs.writeFileSync(indexPath, indexYaml, 'utf-8');
    fs.writeFileSync(contentPath, mdxContent, 'utf-8');

    console.log('[background-doc] Started scribe (local) for conversation:', {
      conversationId,
      slug: finalSlug,
      title: finalTitle,
      paths: { indexPath, contentPath }
    });

    return NextResponse.json({
      success: true,
      slug: finalSlug,
      title: finalTitle,
      conversationId,
      scribe_enabled: true,
      layoutId: null,
      layoutUrl: `/visual-search?highlight=${finalSlug}`
    });

  } catch (error) {
    console.error('[background-doc] Start failed:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
