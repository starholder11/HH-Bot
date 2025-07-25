#!/usr/bin/env tsx

/**
 * LanceDB Content Ingestion Script
 *
 * This script ingests all existing content (media + text) into LanceDB
 * for unified semantic search across your entire content library.
 *
 * Usage:
 *   npm run ingest-lancedb
 *   or
 *   npx tsx scripts/ingest-to-lancedb.ts
 */

import LanceDBIngestionService from '../lib/lancedb-ingestion';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 Starting LanceDB Content Ingestion Process...\n');

  // Check required environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Check if LanceDB service is available
  const lancedbUrl = process.env.LANCEDB_API_URL ||
    'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

  if (!process.env.LANCEDB_API_URL) {
    console.log('ℹ️  Using default LanceDB API URL from script. Set LANCEDB_API_URL to override.');
  }

  console.log(`🔗 Connecting to LanceDB at: ${lancedbUrl}`);

  try {
    // Test LanceDB connection
    const response = await fetch(`${lancedbUrl}/health`);
    if (!response.ok) {
      throw new Error(`LanceDB health check failed: ${response.status}`);
    }
    console.log('✅ LanceDB service is healthy\n');
  } catch (error) {
    console.error('❌ Error: Cannot connect to LanceDB service');
    console.error('   Make sure your LanceDB deployment is running');
    console.error(`   URL: ${lancedbUrl}`);
    console.error(`   Error: ${error}`);
    process.exit(1);
  }

  const startTime = Date.now();
  const ingestionService = new LanceDBIngestionService();

  try {
    // Start the ingestion process
    await ingestionService.ingestAllContent();

    const duration = (Date.now() - startTime) / 1000;
    console.log(`\n🎉 Ingestion completed successfully in ${duration.toFixed(2)} seconds!`);

    // Test the search functionality
    console.log('\n🔍 Testing search functionality...');
    const testResults = await ingestionService.search('timeline future AI', 5);
    console.log(`✅ Search test successful - found ${testResults.length} results`);

    if (testResults.length > 0) {
      console.log('\n📋 Sample search results:');
      testResults.slice(0, 3).forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.title} (${result.content_type})`);
      });
    }

    console.log('\n🎯 Your unified semantic search is now ready!');
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

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Ingestion terminated');
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}
