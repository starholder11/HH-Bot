#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function reIngestTextContent() {
  console.log('🔄 Re-ingesting text content with cleaned embeddings...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Load all text content
    console.log('📄 Loading text content from GitHub...');
    const textContent = await ingestionService.loadTextContent();
    console.log(`✅ Loaded ${textContent.length} text files`);

    // Process and add each text file with cleaned embeddings
    let successCount = 0;
    let errorCount = 0;

    for (const content of textContent) {
      try {
        console.log(`📝 Processing: ${content.slug}`);
        const record = await ingestionService.processTextContent(content);
        await ingestionService.addToLanceDB(record);
        successCount++;
        console.log(`✅ Added: ${content.slug}`);
      } catch (error) {
        console.error(`❌ Failed to process ${content.slug}:`, error);
        errorCount++;
      }
    }

    console.log(`\n🎉 Re-ingestion complete!`);
    console.log(`✅ Successfully processed: ${successCount} files`);
    console.log(`❌ Errors: ${errorCount} files`);

    // Test the search to see if it's working better
    console.log('\n🔍 Testing search with "barry_lyndon"...');
    const testResults = await ingestionService.search('barry_lyndon', 5);
    console.log('Search results:', testResults);

  } catch (error) {
    console.error('❌ Re-ingestion failed:', error);
  }
}

reIngestTextContent().catch(console.error);
