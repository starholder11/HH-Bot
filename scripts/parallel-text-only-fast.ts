#!/usr/bin/env tsx

import { ParallelIngestionService } from '../lib/parallel-ingestion';
import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';
import { chunkText } from '../lib/chunk-utils';
import './bootstrap-env';

async function main() {
  console.log('🚀 FAST PARALLEL TEXT-ONLY INGESTION');
  console.log('⚡ Using modern ParallelIngestionService for maximum speed');

  const parallelService = new ParallelIngestionService();
  const legacyService = new LanceDBIngestionService();
  const LANCEDB_API_URL = process.env.LANCEDB_API_URL || 'http://localhost:8000';

  try {
    // Step 1: Load only text content from GitHub
    console.log('\n📄 Loading text content from GitHub...');
    const textContents = await legacyService.loadTextContent();
    console.log(`✅ Loaded ${textContents.length} text documents`);

    // Step 2: Skip delete if --no-delete flag is present
    if (process.argv.includes('--no-delete') || process.env.SKIP_DELETE_TEXT === '1') {
      console.log('⏭️  Skipping delete-text (guard active via --no-delete or SKIP_DELETE_TEXT=1)');
    } else {
      console.log('\n🧹 Clearing old text data (per document)...');
      for (const doc of textContents) {
        try {
          const res = await fetch(`${LANCEDB_API_URL}/delete-by-prefix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: `text_${doc.slug}` }),
          });
          if (!res.ok) {
            console.warn(`⚠️  Failed to delete text for ${doc.slug}, proceeding...`);
          }
        } catch (error) {
          console.warn(`⚠️  Could not clear old data for ${doc.slug}, proceeding...`);
        }
      }
      console.log('✅ Old text data cleared (per document)');
    }

    // Step 3: Process all text content with chunks in parallel
    console.log('\n⚡ PARALLEL TEXT PROCESSING WITH CHUNKS...');
    const allChunks: any[] = [];

    for (const doc of textContents) {
      const chunks = chunkText(doc.content);
      console.log(`📑 ${doc.slug}: prepared ${chunks.length} chunks`);

      for (const chunk of chunks) {
        allChunks.push({
          id: `text_${doc.slug}#${chunk.ix}`,
          title: doc.title,
          content_type: 'text',
          combinedText: chunk.text,
          metadata: {
            parent_slug: doc.slug,
            chunk_ix: chunk.ix,
            start_word: chunk.startWord,
            frontmatter: doc.frontmatter,
            file_path: doc.file_path,
          },
        });
      }
    }

    console.log(`\n🎯 Processing ${allChunks.length} text chunks with parallel embeddings...`);

    // Use the fast parallel ingestion with optimizations
    await parallelService.ingestWithOptimizations(allChunks, true); // isRefresh = true for upsert behavior

    console.log('\n✅ FAST PARALLEL TEXT INGESTION COMPLETE!');
    console.log(`📊 Successfully processed ${allChunks.length} text chunks from ${textContents.length} documents`);

  } catch (error) {
    console.error('❌ Fast parallel text ingestion failed:', error);
    throw error;
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('🎉 Process completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Process failed:', error);
      process.exit(1);
    });
}
