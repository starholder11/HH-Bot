#!/usr/bin/env tsx
// Re-ingest all text content using chunk-level embeddings.
// 1. Deletes existing text rows from LanceDB
// 2. Splits each MDX/markdown file into ≈200-word chunks with 50% overlap
// 3. Generates an embedding for each chunk
// 4. Adds chunk rows to LanceDB with id pattern <slug>#chunk_<ix>
// 5. Rebuilds IVF_FLAT index

import './bootstrap-env';
import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';
import { chunkText } from '../lib/chunk-utils';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';

import matter from 'gray-matter';

interface TextContent {
  slug: string;
  title: string;
  description?: string;
  content: string;
  frontmatter: any;
  file_path: string;
}

const TIMELINE_DIR = path.join(process.cwd(), 'content', 'timeline');

async function loadLocalTextContent(): Promise<TextContent[]> {
  const out: TextContent[] = [];
  if (!fs.existsSync(TIMELINE_DIR)) {
    console.error(`Local timeline directory not found at ${TIMELINE_DIR}`);
    return out;
  }
  const slugs = fs.readdirSync(TIMELINE_DIR).filter(f => fs.statSync(path.join(TIMELINE_DIR, f)).isDirectory());
  for (const slug of slugs) {
    try {
      const yamlPath = path.join(TIMELINE_DIR, slug, 'index.yaml');
      const mdxPath = path.join(TIMELINE_DIR, slug, 'content.mdx');
      if (!fs.existsSync(mdxPath)) continue;

      const mdxContent = fs.readFileSync(mdxPath, 'utf-8');
      let frontmatter: any = {};
      let description = '';

      if (fs.existsSync(yamlPath)) {
        const ymlContent = fs.readFileSync(yamlPath, 'utf-8');
        frontmatter = yaml.load(ymlContent) || {};
        description = frontmatter.description || '';
      } else {
        // Try to parse frontmatter from MDX itself
        const parsed = matter(mdxContent);
        frontmatter = parsed.data;
      }

      out.push({
        slug,
        title: frontmatter.title || slug,
        description,
        content: mdxContent,
        frontmatter,
        file_path: mdxPath,
      });
    } catch (err) {
      console.warn(`Failed to load local content for ${slug}`, err);
    }
  }
  return out;
}


const LANCEDB_API_URL = process.env.LANCEDB_API_URL || 'http://localhost:8000';

async function wipeOldTextRows() {
  // Safety guard: allow skipping via flag or env var
  const argv = process.argv.slice(2);
  const noDelete = argv.includes('--no-delete') || process.env.SKIP_DELETE_TEXT === '1';
  if (noDelete) {
    console.log('⏭️  Skipping delete-text (guard active via --no-delete or SKIP_DELETE_TEXT=1)');
    return;
  }
  if (process.env.CONFIRM_TEXT_WIPE !== 'YES') {
    console.log('⛔ Refusing to delete text rows: set CONFIRM_TEXT_WIPE=YES to proceed or use --no-delete');
    return;
  }
  console.log('🗑️  Deleting existing text rows from LanceDB...');
  const res = await fetch(`${LANCEDB_API_URL}/delete-text`, { method: 'POST' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to delete text rows: ${res.status} ${txt}`);
  }
  const data = await res.json();
  console.log(`✅ Deleted ${data.deleted} rows`);
}

async function buildIndex() {
  console.log('🔧 Rebuilding index...');
  const res = await fetch(`${LANCEDB_API_URL}/build-index`, { method: 'POST' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to build index: ${res.status} ${txt}`);
  }
  console.log('✅ Index rebuilt');
}

async function ingest() {
  const ingestionService = new LanceDBIngestionService();
  console.log('📄 Loading text content...');
  let texts;
  try {
    texts = await ingestionService.loadTextContent();
  } catch (err) {
    console.warn('⚠️  loadTextContent() failed, falling back to local file scan. Details:', (err as Error).message);
    texts = await loadLocalTextContent();
  }
  console.log(`✅ Loaded ${texts.length} documents`);

  let success = 0, errors = 0, chunksTotal = 0;

  for (const doc of texts) {
    try {
      // Targeted delete: remove existing chunks for this document only
      try {
        const prefix = `text_${doc.slug}`;
        await fetch(`${LANCEDB_API_URL}/delete-by-prefix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix })
        });
      } catch {}

      const chunks = chunkText(doc.content);
      for (const c of chunks) {
        const chunkId = `text_${doc.slug}#${c.ix}`;
        const record = await ingestionService.processTextContent({
          ...doc,
          slug: `${doc.slug}#${c.ix}`,
          content: c.text,
        });
        record.id = chunkId;
        // Preserve parent relationship for grouping (via id pattern)
        record.metadata = {
          ...record.metadata,
          parent_slug: doc.slug,
          chunk_ix: c.ix,
          start_word: c.startWord,
        };

        await ingestionService.addToLanceDB(record);
        success++;
      }
      chunksTotal += chunks.length;
      console.log(`📑 ${doc.slug}: added ${chunks.length} chunks`);
    } catch (err) {
      console.error(`❌ Failed to ingest ${doc.slug}`, err);
      errors++;
    }
  }

  console.log(`🎉 Ingestion finished. Documents: ${texts.length}, Chunks: ${chunksTotal}, Success: ${success}, Errors: ${errors}`);
}

(async () => {
  try {
    await wipeOldTextRows();
    await ingest();
    await buildIndex();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
