#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function fixLanceDBEmbeddings() {
  console.log('🔧 Fixing LanceDB embeddings...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Load all text content from GitHub
    console.log('\n📄 Step 1: Loading text content from GitHub...');
    const textContent = await ingestionService.loadTextContent();
    console.log(`✅ Loaded ${textContent.length} text files`);

    // Step 2: Process and re-ingest each file with cleaned embeddings
    console.log('\n📝 Step 2: Re-ingesting with cleaned embeddings...');
    let successCount = 0;
    let errorCount = 0;

    for (const content of textContent) {
      try {
        console.log(`📝 Processing: ${content.slug}`);

        // Process with cleaned embeddings
        const record = await ingestionService.processTextContent(content);

        // Add to LanceDB (this will overwrite existing record)
        await ingestionService.addToLanceDB(record);

        successCount++;
        console.log(`✅ Fixed: ${content.slug}`);
      } catch (error) {
        console.error(`❌ Failed to fix ${content.slug}:`, error);
        errorCount++;
      }
    }

    console.log(`\n🎉 Re-ingestion complete!`);
    console.log(`✅ Successfully fixed: ${successCount} files`);
    console.log(`❌ Errors: ${errorCount} files`);

    // Step 3: Test the fix
    console.log('\n🧪 Step 3: Testing the fix...');
    console.log('Testing search for "barry_lyndon"...');

    const testResults = await ingestionService.search('barry_lyndon', 5);
    console.log('Search results:');
    testResults.forEach((result: any, index: number) => {
      console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
    });

    // Step 4: Test with a known relevant query
    console.log('\n🧪 Step 4: Testing with relevant query...');
    console.log('Testing search for "hyperreal hospitality"...');

    const relevantResults = await ingestionService.search('hyperreal hospitality', 5);
    console.log('Relevant search results:');
    relevantResults.forEach((result: any, index: number) => {
      console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
    });

  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

fixLanceDBEmbeddings().catch(console.error);
