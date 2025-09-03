import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const { slug } = params;
    
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }
    
    const baseDir = path.join(process.cwd(), 'content', 'timeline', slug);
    const indexPath = path.join(baseDir, 'index.yaml');
    const contentPath = path.join(baseDir, 'content.mdx');
    
    if (!fs.existsSync(indexPath) || !fs.existsSync(contentPath)) {
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
