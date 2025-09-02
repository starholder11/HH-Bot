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
    const body = await req.json();
    const {
      slug: rawSlug,
      title = 'Untitled',
      categories = [],
      source = 'layout',
      status = 'draft',
      mdx = ''
    } = body || {};

    const slug = slugify(rawSlug || title);
    if (!slug) {
      return NextResponse.json({ success: false, error: 'Missing slug/title' }, { status: 400 });
    }

    const baseDir = path.join(process.cwd(), 'content', 'timeline', slug);
    const indexPath = path.join(baseDir, 'index.yaml');
    const contentPath = path.join(baseDir, 'content.mdx');

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const indexDoc = {
      slug,
      title,
      date: new Date().toISOString(),
      categories: Array.isArray(categories) ? categories : String(categories || '').split(',').map((s) => s.trim()).filter(Boolean),
      source,
      status,
    };

    const indexYaml = yaml.dump(indexDoc, { noRefs: true });
    fs.writeFileSync(indexPath, indexYaml, 'utf-8');
    fs.writeFileSync(contentPath, String(mdx ?? ''), 'utf-8');

    return NextResponse.json({ success: true, slug, paths: { indexPath, contentPath } });
  } catch (error) {
    console.error('[text-assets] POST failed', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}


