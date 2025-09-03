import { NextRequest, NextResponse } from 'next/server';
import { getFileContentFromGitHub, syncTimelineEntry } from '@/lib/openai-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = params?.slug;
  if (!slug) return NextResponse.json({ success: false, error: 'Missing slug' }, { status: 400 });

  try {
    const apiKeyPresent = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || process.env.OAI_API_KEY);
    const vectorStoreId = process.env.OAI_VECTOR_STORE_ID || process.env.OPENAI_VECTOR_STORE_ID || process.env.OPENAI_VECTORSTORE_ID || '';

    // Fetch MDX content directly from GitHub main branch
    const path = `content/timeline/${slug}/content.mdx`;
    const mdx = await getFileContentFromGitHub(path, 'main', false);

    // Best-effort sync using versioned name strategy
    await syncTimelineEntry(slug, mdx);

    return NextResponse.json({
      success: true,
      slug,
      vectorStoreConfigured: !!vectorStoreId,
      apiKeyPresent,
      details: 'Synced via syncTimelineEntry; check vector store for new versioned filename.'
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}


