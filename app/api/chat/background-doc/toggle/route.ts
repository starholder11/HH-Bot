import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { slug, scribe_enabled } = await req.json();

    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    if (typeof scribe_enabled !== 'boolean') {
      return NextResponse.json({ error: 'scribe_enabled must be boolean' }, { status: 400 });
    }

    // Read current document to get existing data (reading is allowed on Vercel)
    const baseDir = path.join(process.cwd(), 'content', 'timeline', slug);
    const indexPath = path.join(baseDir, 'index.yaml');
    const contentPath = path.join(baseDir, 'content.mdx');

    if (!fs.existsSync(indexPath)) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Parse existing YAML
    const existingYaml = fs.readFileSync(indexPath, 'utf-8');
    const existingDoc = yaml.load(existingYaml) as any;

    // Update scribe_enabled field
    const updatedDoc = {
      ...existingDoc,
      scribe_enabled
    } as any;

    const updatedYaml = yaml.dump(updatedDoc, { noRefs: true });

    const isServerless = !!process.env.VERCEL;
    if (isServerless) {
      // Enqueue the updated YAML via agent backend; do not write to FS
      let enqueued = false;
      try {
        const agentBackend = process.env.AGENT_BACKEND_URL || process.env.LANCEDB_API_URL;
        const mdx = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, 'utf-8') : '';
        if (agentBackend) {
          const resp = await fetch(`${agentBackend}/api/text-assets/enqueue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, indexYaml: updatedYaml, mdx, scribe_enabled })
          });
          enqueued = resp.ok;
        }
      } catch (err) {
        console.warn('[background-doc] Toggle enqueue failed (non-blocking):', (err as Error)?.message || err);
      }

      console.log('[background-doc] Toggled scribe (serverless) and enqueued:', { slug, scribe_enabled, enqueued });
      return NextResponse.json({ success: true, slug, scribe_enabled, enqueued, message: scribe_enabled ? 'Scribe activated' : 'Scribe disabled' });
    }

    // Local/dev: write updated YAML to filesystem
    fs.writeFileSync(indexPath, updatedYaml, 'utf-8');

    console.log('[background-doc] Toggled scribe (local) for document:', { slug, scribe_enabled });
    return NextResponse.json({ success: true, slug, scribe_enabled, message: scribe_enabled ? 'Scribe activated' : 'Scribe disabled' });

  } catch (error) {
    console.error('[background-doc] Toggle failed:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
