#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function reIngestCleanText() {
  console.log('🔄 Re-ingesting text content with cleaned embeddings...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Create fresh text content with cleaned embeddings
    console.log('\n📝 Creating fresh text content...');

    const textContent = [
      {
        slug: 'posts/hello-world',
        title: 'Hello World',
        description: 'Welcome to Hyperreal Hospitality',
        content: `# Welcome to Hyperreal Hospitality

This is a sample post to test the content management system.

## About This Site

Hyperreal Hospitality is a retreat and sanctuary on the digital frontier, designed to educate, inform, entertain and guide people as they confront a future of AI and automation.

## Content Coming Soon

We're preparing our knowledge base and content library. Stay tuned for more articles about the Starholder timeline and the possible futures of AI and automation.`,
        frontmatter: {
          title: 'Hello World',
          description: 'Welcome to Hyperreal Hospitality',
          date: '2025-01-01T00:00:00.000Z'
        },
        file_path: '/Users/c_fur1/Desktop/HH-Bot/content/posts/hello-world.md'
      }
    ];

    // Process and add each text file with cleaned embeddings
    console.log('\n📤 Re-ingesting with cleaned embeddings...');
    let successCount = 0;
    let errorCount = 0;

    for (const content of textContent) {
      try {
        console.log(`📝 Processing: ${content.slug}`);

        // Process with cleaned embeddings
        const record = await ingestionService.processTextContent(content);

        // Add to LanceDB (this will overwrite existing record with same ID)
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

    // Test the fix
    console.log('\n🧪 Testing the fix...');

    console.log('Testing search for "hyperreal hospitality"...');
    const relevantResults = await ingestionService.search('hyperreal hospitality', 5);
    console.log('Relevant search results:');
    if (Array.isArray(relevantResults)) {
      relevantResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('Search results:', relevantResults);
    }

    console.log('\nTesting search for "barry_lyndon"...');
    const irrelevantResults = await ingestionService.search('barry_lyndon', 5);
    console.log('Irrelevant search results:');
    if (Array.isArray(irrelevantResults)) {
      irrelevantResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('Search results:', irrelevantResults);
    }

  } catch (error) {
    console.error('❌ Re-ingestion failed:', error);
  }
}

reIngestCleanText().catch(console.error);
