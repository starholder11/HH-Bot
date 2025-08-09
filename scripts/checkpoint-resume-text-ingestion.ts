#!/usr/bin/env tsx

import { ParallelIngestionService } from '../lib/parallel-ingestion';
import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';
import { chunkText } from '../lib/chunk-utils';
import './bootstrap-env';

interface ProcessedDocument {
  slug: string;
  chunkCount: number;
  lastProcessedChunk: number;
  status: 'completed' | 'partial' | 'failed';
}

async function checkExistingTextDocuments(lancedbUrl: string): Promise<Set<string>> {
  console.log('🔍 Checking which text documents are already in LanceDB...');

  try {
    // Search for all text records with empty query to get them all
    const response = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '',
        vector: new Array(1536).fill(0), // dummy vector
        limit: 50000, // Large limit to get all records
        filter: "content_type = 'text'"
      })
    });

    if (!response.ok) {
      console.warn(`⚠️  Could not check existing documents: ${response.status}`);
      return new Set();
    }

    const results = await response.json();
    const existingDocs = new Set<string>();

    // Extract unique document slugs from text chunk IDs
    for (const result of results) {
      if (result.id && result.id.startsWith('text_')) {
        // Extract slug from ID like "text_slug#123"
        const match = result.id.match(/^text_([^#]+)/);
        if (match) {
          existingDocs.add(match[1]);
        }
      }
    }

    console.log(`✅ Found ${existingDocs.size} text documents already in LanceDB`);
    return existingDocs;

  } catch (error) {
    console.warn(`⚠️  Could not check existing documents:`, error.message);
    return new Set();
  }
}

async function main() {
  console.log('🔄 CHECKPOINT-AWARE TEXT INGESTION');
  console.log('⚡ Resumes from where previous runs left off');
  console.log('📋 Only processes missing or incomplete documents');

  const parallelService = new ParallelIngestionService();
  const legacyService = new LanceDBIngestionService();
  const LANCEDB_API_URL = process.env.LANCEDB_API_URL || 'http://localhost:8000';

  try {
    // Step 1: Check current state
    console.log('\\n📊 Checking current LanceDB state...');
    const countResponse = await fetch(`${LANCEDB_API_URL}/count`);
    if (countResponse.ok) {
      const { count } = await countResponse.json();
      console.log(`📊 Current LanceDB records: ${count}`);
    }

    // Step 2: Load all text content from GitHub
    console.log('\\n📄 Loading text content from GitHub...');
    const textContents = await legacyService.loadTextContent();
    console.log(`✅ Loaded ${textContents.length} text documents from GitHub`);

    // Step 3: Check which documents are already processed
    const existingDocs = await checkExistingTextDocuments(LANCEDB_API_URL);

    // Step 4: Filter to only documents that need processing
    const docsToProcess = textContents.filter(doc => !existingDocs.has(doc.slug));

    console.log(`\\n🎯 Processing strategy:`);
    console.log(`   📚 Total documents: ${textContents.length}`);
    console.log(`   ✅ Already processed: ${existingDocs.size}`);
    console.log(`   🔄 Need processing: ${docsToProcess.length}`);

    if (docsToProcess.length === 0) {
      console.log('\\n🎉 All text documents are already processed!');
      console.log('✅ Text ingestion is complete');
      return;
    }

    // Step 5: Process only the missing documents
    console.log(`\\n⚡ Processing ${docsToProcess.length} missing documents...`);

    // Convert documents to content items with chunks
    const contentItems = [];
    let totalChunks = 0;

    for (const doc of docsToProcess) {
      const chunks = chunkText(doc.content);
      totalChunks += chunks.length;

      for (const chunk of chunks) {
        contentItems.push({
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

      console.log(`📝 ${doc.slug}: ${chunks.length} chunks`);
    }

    console.log(`\\n📊 Resume ingestion summary:`);
    console.log(`   📚 Documents to process: ${docsToProcess.length}`);
    console.log(`   🧩 Total chunks to generate: ${totalChunks}`);
    console.log(`   ⏭️  Skipped documents: ${existingDocs.size}`);

    // Step 6: Ingest with optimizations
    console.log(`\\n🚀 Starting optimized parallel ingestion...`);
    await parallelService.ingestWithOptimizations(contentItems, true);

    console.log(`\\n✅ Checkpoint resume completed successfully!`);
    console.log(`📊 Processed ${docsToProcess.length} documents with ${totalChunks} chunks`);

  } catch (error) {
    console.error('❌ Checkpoint resume failed:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('💥 Process failed:', error);
  process.exit(1);
});
