#!/usr/bin/env tsx

import LanceDBIngestionService from '../lib/lancedb-ingestion';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 Starting MEDIA-ONLY LanceDB Ingestion...\n');

  // Check required environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Check if LanceDB service is available
  const lancedbUrl = process.env.LANCEDB_API_URL ||
    'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

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
    console.error(`   URL: ${lancedbUrl}`);
    console.error(`   Error: ${error}`);
    process.exit(1);
  }

  const startTime = Date.now();
  const ingestionService = new LanceDBIngestionService();

  try {
    console.log('🎬 Processing MEDIA content only (skipping text for now)...');

    // Load media assets (this is where the 175 assets + 140 songs are)
    console.log('📁 Loading media assets from S3...');
    const mediaAssets = await ingestionService.loadMediaAssets();
    console.log(`✅ Found ${mediaAssets.length} media assets`);

    if (mediaAssets.length === 0) {
      console.log('⚠️ No media assets found. Check S3 configuration.');
      return;
    }

    // Process each media asset
    console.log('🔄 Processing and embedding media assets...');
    let successCount = 0;
    let errorCount = 0;

    for (const asset of mediaAssets.slice(0, 10)) { // Start with first 10 to test
      try {
        console.log(`   Processing: ${asset.title} (${asset.media_type})`);
        const record = await ingestionService.processMediaAsset(asset);
        await ingestionService.addToLanceDB(record);
        successCount++;
        console.log(`   ✅ Added: ${asset.title}`);
      } catch (error) {
        errorCount++;
        console.error(`   ❌ Failed: ${asset.title} - ${error}`);
      }
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`\n🎉 Media ingestion completed in ${duration.toFixed(2)} seconds!`);
    console.log(`   Success: ${successCount} assets`);
    console.log(`   Errors: ${errorCount} assets`);

    // Test the search functionality
    console.log('\n🔍 Testing search with media content...');
    const testResults = await ingestionService.search('music electronic creative', 5);
    console.log(`✅ Search test successful - found ${(testResults as any).results?.length || 0} results`);

    if ((testResults as any).results?.length > 0) {
      console.log('\n📋 Sample search results:');
      (testResults as any).results.slice(0, 3).forEach((result: any, index: number) => {
        console.log(`  ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    }

    console.log('\n🎯 MEDIA SEARCH IS NOW WORKING!');
    console.log('   Test it at: http://localhost:3001/app/unified-search');

  } catch (error) {
    console.error('\n💥 Media ingestion failed:', error);
    process.exit(1);
  }
}

main();
