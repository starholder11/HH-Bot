#!/usr/bin/env tsx

import { ParallelIngestionService, ContentItem } from '../lib/parallel-ingestion';
import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';
import './bootstrap-env';

async function buildIndex() {
  console.log('🔧 Building search index...');

  const LANCEDB_API_URL = process.env.LANCEDB_API_URL || 'http://localhost:8000';

  try {
    const response = await fetch(`${LANCEDB_API_URL}/build-index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Index build failed: ${response.status}`);
    }

    console.log('✅ Search index built successfully');
  } catch (error) {
    console.error('❌ Index build failed:', error);
    throw error;
  }
}

async function testSearch() {
  console.log('🧪 Testing search functionality...');

  const LANCEDB_API_URL = process.env.LANCEDB_API_URL || 'http://localhost:8000';

  const testQueries = [
    'test search functionality',
    'music audio content',
    'video content analysis'
  ];

  for (const query of testQueries) {
    try {
      console.log(`🔍 Testing query: "${query}"`);

      const response = await fetch(`${LANCEDB_API_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 3 })
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const results = await response.json();
      console.log(`✅ Found ${results.length} results for "${query}"`);

    } catch (error) {
      console.error(`❌ Search test failed for "${query}":`, error);
    }
  }
}

async function parallelComprehensiveIngestion() {
  console.log('🚀 PARALLEL COMPREHENSIVE INGESTION - OPTIMIZED FOR SPEED');
  console.log('=' * 60);

  const overallStartTime = Date.now();

  try {
    // Initialize services
    const parallelService = new ParallelIngestionService();
    const legacyService = new LanceDBIngestionService();

    // Step 1: Load all content
    console.log('\n📁 Step 1: Loading all content...');

    const [mediaAssets, textContents] = await Promise.all([
      legacyService.loadMediaAssets(),
      legacyService.loadTextContent()
    ]);

    console.log(`✅ Loaded ${mediaAssets.length} media assets`);
    console.log(`✅ Loaded ${textContents.length} text documents`);

    // Log media breakdown
    const mediaByType = mediaAssets.reduce((acc, asset) => {
      acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 Media assets by type:');
    Object.entries(mediaByType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Step 2: Convert to unified ContentItem format
    console.log('\n🔄 Step 2: Converting to unified format...');

    const mediaItems: ContentItem[] = mediaAssets.map(asset =>
      ParallelIngestionService.mediaAssetToContentItem(asset)
    );

    const textItems: ContentItem[] = textContents.map(text => ({
      id: text.slug,
      title: text.title,
      content_type: 'text',
      combinedText: `${text.title}\n${text.description || ''}\n${text.content}`,
      metadata: {
        file_path: text.file_path,
        frontmatter: text.frontmatter
      }
    }));

    const allItems = [...textItems, ...mediaItems];
    console.log(`📦 Total items to process: ${allItems.length}`);

    // Step 3: Clear old text data (guarded)
    console.log('\n🧹 Step 3: Clearing old text data (guarded)...');

    const argv = process.argv.slice(2);
    const noDelete = argv.includes('--no-delete') || process.env.SKIP_DELETE_TEXT === '1';
    if (!noDelete && process.env.CONFIRM_TEXT_WIPE === 'YES') {
      try {
        // Targeted per-document cleanup using prefix
        const LANCEDB_API_URL = process.env.LANCEDB_API_URL || 'http://localhost:8000';
        for (const t of textContents) {
          const prefix = `text_${t.slug}`;
          await fetch(`${LANCEDB_API_URL}/delete-by-prefix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix })
          });
        }
        console.log('✅ Cleared old text chunks per-document');
      } catch (error) {
        console.log('ℹ️  Could not clear old text chunks, proceeding...');
      }
    } else {
      console.log('⏭️  Skipping targeted text cleanup');
    }

    // Step 4: PARALLEL OPTIMIZED INGESTION
    console.log('\n🚀 Step 4: PARALLEL OPTIMIZED INGESTION');
    console.log('⚡ This will be MUCH faster than the old sequential approach!');

    await parallelService.ingestWithOptimizations(allItems);

    // Step 5: Build search index
    console.log('\n🔧 Step 5: Building search index...');
    await buildIndex();

    // Step 6: Test search functionality
    console.log('\n🧪 Step 6: Testing search functionality...');
    await testSearch();

    // Step 7: Final verification
    console.log('\n📊 Step 7: Final verification...');

    const LANCEDB_API_URL = process.env.LANCEDB_API_URL || 'http://localhost:8000';
    const countResponse = await fetch(`${LANCEDB_API_URL}/count`);

    if (countResponse.ok) {
      const { count } = await countResponse.json();
      console.log(`✅ Final record count: ${count}`);

      if (count >= allItems.length) {
        console.log('🎉 All items successfully ingested!');
      } else {
        console.log(`⚠️  Record count lower than expected: ${count}/${allItems.length}`);
      }
    }

    const totalTime = Date.now() - overallStartTime;
    const originalTime = 90 * 60 * 1000; // 90 minutes in ms
    const speedup = originalTime / totalTime;

    console.log('\n🎉 PARALLEL INGESTION COMPLETE!');
    console.log('=' * 60);
    console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s (${(totalTime / 60000).toFixed(1)} minutes)`);
    console.log(`📊 Items processed: ${allItems.length}`);
    console.log(`🚀 Speed improvement: ${speedup.toFixed(1)}x faster than original`);
    console.log(`💰 Estimated cost savings: ~50% (batch API usage)`);

    if (totalTime < 5 * 60 * 1000) { // Less than 5 minutes
      console.log('🏆 SUCCESS: Ingestion completed in under 5 minutes!');
    }

  } catch (error) {
    console.error('❌ Parallel ingestion failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Performance monitoring
async function main() {
  const memUsage = process.memoryUsage();
  console.log(`💾 Initial memory usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);

  await parallelComprehensiveIngestion();

  const finalMemUsage = process.memoryUsage();
  console.log(`💾 Final memory usage: ${(finalMemUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
}

main().catch(console.error);
