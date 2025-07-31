#!/usr/bin/env tsx

/**
 * LanceDB Text-Only Content Ingestion Script
 *
 * This script ingests only text content into LanceDB for testing purposes.
 * It skips media assets to avoid S3 configuration requirements.
 *
 * Usage:
 *   npx tsx scripts/ingest-text-only.ts
 */

import LanceDBIngestionService from '../lib/lancedb-ingestion';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 Starting LanceDB Text-Only Content Ingestion Process...\n');

  // Check required environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Use local LanceDB for development
  const lancedbUrl = 'http://localhost:8000';
  console.log(`🔗 Connecting to local LanceDB at: ${lancedbUrl}`);

  // Override the LANCEDB_API_URL to use local service
  process.env.LANCEDB_API_URL = lancedbUrl;

  try {
    // Test LanceDB connection
    const response = await fetch(`${lancedbUrl}/health`);
    if (!response.ok) {
      throw new Error(`LanceDB health check failed: ${response.status}`);
    }
    console.log('✅ LanceDB service is healthy\n');
  } catch (error) {
    console.error('❌ Error: Cannot connect to LanceDB service');
    console.error('   Make sure your local LanceDB service is running');
    console.error(`   URL: ${lancedbUrl}`);
    console.error(`   Error: ${error}`);
    process.exit(1);
  }

  const startTime = Date.now();
  const ingestionService = new LanceDBIngestionService();

  try {
    // Load and process text content only
    console.log('📄 Processing text content...');
    const textContents = await ingestionService.loadTextContent();
    console.log(`Found ${textContents.length} text files`);

    let processedCount = 0;
    for (const content of textContents) {
      try {
        const record = await ingestionService.processTextContent(content);
        await ingestionService.addToLanceDB(record);
        console.log(`✅ Added text: ${content.title}`);
        processedCount++;
      } catch (error) {
        console.error(`❌ Failed to process text ${content.title}:`, error);
      }
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`\n🎉 Text ingestion completed successfully!`);
    console.log(`   Processed ${processedCount} text files in ${duration.toFixed(2)} seconds`);

    // Test the search functionality
    console.log('\n🔍 Testing search functionality...');
    const testResults = await ingestionService.search('almond al', 5);
    console.log(`✅ Search test successful - found ${testResults.length} results`);

    if (testResults.length > 0) {
      console.log('\n📋 Sample search results:');
      testResults.slice(0, 3).forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.title} (${result.content_type})`);
      });
    }

    console.log('\n🎯 Your text-only semantic search is now ready!');
    console.log(`   API endpoint: ${lancedbUrl}`);
    console.log('   Next.js API: /api/unified-search');

  } catch (error) {
    console.error('\n💥 Ingestion failed:', error);

    if (error instanceof Error) {
      console.error('Error details:', error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }

    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Ingestion interrupted by user');
  process.exit(0);
});

main().catch(console.error);
