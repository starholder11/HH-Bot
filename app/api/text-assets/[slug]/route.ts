import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const { slug } = params;
    console.log('[text-assets] GET request for slug:', slug);

    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    const baseDir = path.join(process.cwd(), 'content', 'timeline', slug);
    const indexPath = path.join(baseDir, 'index.yaml');
    const contentPath = path.join(baseDir, 'content.mdx');

    console.log('[text-assets] Checking paths:', { indexPath, contentPath, indexExists: fs.existsSync(indexPath), contentExists: fs.existsSync(contentPath) });

    if (!fs.existsSync(indexPath) || !fs.existsSync(contentPath)) {
      // Fallback: fetch draft from agent backend (Redis) when not committed yet
      console.log('[text-assets] Files not found, trying backend fallback...');
      try {
        const agentBackend = process.env.AGENT_BACKEND_URL || process.env.LANCEDB_API_URL || 'http://lancedb-bulletproof-simple-alb-705151448.us-east-1.elb.amazonaws.com';
        console.log('[text-assets] Using backend URL:', agentBackend);
        
        const resp = (await Promise.race([
          fetch(`${agentBackend}/api/text-assets/enqueue?slug=${encodeURIComponent(slug)}`, { method: 'GET', headers: { 'Content-Type': 'application/json' } }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ])) as Response;

        console.log('[text-assets] Backend response status:', resp.status);
        
        if (resp.ok) {
          const data = await resp.json();
          console.log('[text-assets] Backend data:', JSON.stringify(data, null, 2));
          return NextResponse.json({
            success: true,
            slug: data.slug || slug,
            title: data.title || slug,
            scribe_enabled: !!data.scribe_enabled,
            conversation_id: data.conversation_id || null,
            mdx: data.mdx || '',
            metadata: null
          });
        } else {
          const errorText = await resp.text();
          console.log('[text-assets] Backend error:', resp.status, errorText);
        }
      } catch (e) {
        console.log('[text-assets] Backend fallback failed:', (e as Error)?.message || e);
      }

      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Read document files
    const yamlContent = fs.readFileSync(indexPath, 'utf-8');
    const mdxContent = fs.readFileSync(contentPath, 'utf-8');
    const metadata = yaml.load(yamlContent) as any;

    return NextResponse.json({
      success: true,
      slug,
      title: metadata.title,
      date: metadata.date,
      categories: metadata.categories || [],
      source: metadata.source,
      status: metadata.status,
      scribe_enabled: metadata.scribe_enabled || false,
      conversation_id: metadata.conversation_id || null,
      mdx: mdxContent,
      metadata
    });

  } catch (error) {
    console.error('[text-assets] GET failed:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
