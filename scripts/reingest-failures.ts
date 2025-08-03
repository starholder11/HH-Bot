#!/usr/bin/env tsx
// Re-ingest the 11 documents that failed due to connection resets

import './bootstrap-env';
import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';
import { chunkText } from '../lib/chunk-utils';
import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';

const FAILED_SLUGS = [
  'mention-vs-girlfight',
  'mindscape',
  'sprogfat',
  'starholder-institute',
  'tamira-fontenot',
  'terrace-me-to-death',
  'the-astral-and-the-quantum',
  'valois',
  'warth-of-harmonia',
  'we-are-leaving-you-behind',
  'when-life-gives-you-lemons-make-lemonade-stonks'
];

async function loadLocalTextContent(slug: string) {
  const mdxPath = path.join(process.cwd(), 'content/timeline', slug, 'index.mdx');

  if (!fs.existsSync(mdxPath)) {
    throw new Error(`File not found: ${mdxPath}`);
  }

  const content = fs.readFileSync(mdxPath, 'utf8');
  const { data: frontmatter, content: mdxContent } = matter(content);

  return {
    slug,
    title: frontmatter.title || slug,
    content: mdxContent,
    frontmatter
  };
}

async function reingestFailures() {
  console.log('🔄 Re-ingesting failed documents...');

  const ingestionService = new LanceDBIngestionService();
  let successCount = 0;
  let errorCount = 0;

  for (const slug of FAILED_SLUGS) {
    try {
      console.log(`📑 Processing: ${slug}`);

      // Load content
      const doc = await loadLocalTextContent(slug);

      // Split into chunks
      const chunks = chunkText(doc.content);
      console.log(`   └─ ${chunks.length} chunks`);

      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkId = `${slug}#chunk_${chunk.ix}`;

        try {
          await ingestionService.processTextContent({
            id: chunkId,
            slug: slug,
            title: doc.title,
            content: chunk.text,
            content_type: 'text',
            searchable_text: chunk.text
          });

          // Small delay to avoid overwhelming the service
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          console.error(`❌ Failed chunk ${chunkId}:`, error);
          errorCount++;
        }
      }

      successCount++;
      console.log(`✅ ${slug}: ${chunks.length} chunks added`);

    } catch (error) {
      console.error(`❌ Failed to process ${slug}:`, error);
      errorCount++;
    }
  }

  console.log(`\n🎉 Re-ingestion complete!`);
  console.log(`✅ Documents processed: ${successCount}/${FAILED_SLUGS.length}`);
  console.log(`❌ Errors: ${errorCount}`);
}

// Run the re-ingestion
reingestFailures().catch(console.error);
