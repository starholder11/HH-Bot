#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function fixHelloWorldEmbedding() {
  console.log('🔧 Fixing Hello World embedding...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Create the Hello World content manually
    const helloWorldContent = {
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
    };

    console.log('📝 Processing Hello World with cleaned embeddings...');
    const record = await ingestionService.processTextContent(helloWorldContent);

    console.log('📤 Adding to LanceDB...');
    await ingestionService.addToLanceDB(record);

    console.log('✅ Hello World embedding fixed!');

    // Test the fix
    console.log('\n🧪 Testing the fix...');
    console.log('Testing search for "barry_lyndon"...');

    const testResults = await ingestionService.search('barry_lyndon', 5);
    console.log('Search results:');
    testResults.forEach((result: any, index: number) => {
      console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
    });

    // Test with relevant query
    console.log('\n🧪 Testing with relevant query...');
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

fixHelloWorldEmbedding().catch(console.error);
