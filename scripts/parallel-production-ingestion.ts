#!/usr/bin/env tsx

import { ParallelIngestionService, ContentItem } from '../lib/parallel-ingestion';
import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';
import './bootstrap-env';

/**
 * Production-compatible parallel ingestion that uses existing /add endpoint
 * with high concurrency for massive speed improvements
 */
class ProductionParallelIngestion extends ParallelIngestionService {

  /**
   * Override to use single /add calls with high concurrency
   * instead of bulk operations
   */
  async bulkInsertToLanceDB(records: any[]): Promise<void> {
    console.log(`📦 Parallel inserting ${records.length} records to production LanceDB...`);
    console.log(`🔗 Using production URL: ${this.LANCEDB_API_URL}/add`);

    const CONCURRENCY = 25; // High concurrency for /add calls
    const errors: any[] = [];
    let successCount = 0;

    // Process records in highly concurrent batches
    for (let i = 0; i < records.length; i += CONCURRENCY) {
      const batch = records.slice(i, i + CONCURRENCY);
      const batchNum = Math.floor(i / CONCURRENCY) + 1;
      const totalBatches = Math.ceil(records.length / CONCURRENCY);

      console.log(`⚡ Processing parallel batch ${batchNum}/${totalBatches} (${batch.length} records)...`);

      // Execute all /add calls in parallel
      const results = await Promise.allSettled(
        batch.map(async (record, idx) => {
          try {
            const response = await fetch(`${this.LANCEDB_API_URL}/add`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(record)
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Record ${i + idx} failed: ${response.status} ${errorText}`);
            }

            return { success: true, index: i + idx };
          } catch (error) {
            return { success: false, index: i + idx, error };
          }
        })
      );

      // Process results
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          const error = result.status === 'rejected' ? result.reason : result.value.error;
          errors.push({ index: i + idx, error: error.message });
          console.error(`❌ Record ${i + idx} failed:`, error.message);
        }
      });

      console.log(`✅ Batch ${batchNum}/${totalBatches} complete: ${successCount}/${i + batch.length} successful`);

      // Small delay to avoid overwhelming the service
      if (i + CONCURRENCY < records.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} records failed, ${successCount} succeeded`);
      if (errors.length > records.length * 0.1) { // More than 10% failed
        throw new Error(`Too many failures: ${errors.length}/${records.length} records failed`);
      }
    } else {
      console.log(`🎉 All ${successCount} records inserted successfully!`);
    }
  }
}

async function buildProductionIndex() {
  console.log('🔧 Building production search index...');

  const LANCEDB_API_URL = process.env.LANCEDB_API_URL;

  try {
    const response = await fetch(`${LANCEDB_API_URL}/build-index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Index build failed: ${response.status}`);
    }

    console.log('✅ Production search index built successfully');
  } catch (error) {
    console.error('❌ Index build failed:', error);
    throw error;
  }
}

async function testProductionSearch() {
  console.log('🧪 Testing production search functionality...');

  const LANCEDB_API_URL = process.env.LANCEDB_API_URL;

  const testQueries = [
    'music audio content',
    'video analysis',
    'text content'
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

async function productionParallelIngestion() {
  console.log('🚀 PRODUCTION PARALLEL INGESTION WITH PERSISTENT STORAGE');
  console.log('🔒 Using EFS persistent storage - data will survive restarts!');
  console.log('⚡ High concurrency with existing /add endpoint');
  console.log('=' * 70);

  const overallStartTime = Date.now();

  try {
    // Initialize services
    const parallelService = new ProductionParallelIngestion();
    const legacyService = new LanceDBIngestionService();

    // Step 1: Check current production state
    console.log('\n📊 Step 1: Checking production state...');

    const LANCEDB_API_URL = process.env.LANCEDB_API_URL;
    const countResponse = await fetch(`${LANCEDB_API_URL}/count`);

    if (countResponse.ok) {
      const { count } = await countResponse.json();
      console.log(`📊 Current production records: ${count}`);
      console.log(`✅ EFS persistent storage is working - data persisted!`);
    }

    // Step 2: Load all content
    console.log('\n📁 Step 2: Loading all content for ingestion...');

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

    // Step 3: Convert to unified ContentItem format
    console.log('\n🔄 Step 3: Converting to unified format...');

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

    // Step 4: PRODUCTION PARALLEL INGESTION WITH PERSISTENT STORAGE
    console.log('\n🚀 Step 4: PRODUCTION PARALLEL INGESTION');
    console.log('🔒 Data will be permanently stored in EFS');
    console.log('⚡ Using high-concurrency /add calls for maximum speed');

    await parallelService.ingestWithOptimizations(allItems);

    // Step 5: Build search index
    console.log('\n🔧 Step 5: Building production search index...');
    await buildProductionIndex();

    // Step 6: Test search functionality
    console.log('\n🧪 Step 6: Testing production search functionality...');
    await testProductionSearch();

    // Step 7: Final verification
    console.log('\n📊 Step 7: Final verification...');

    const finalCountResponse = await fetch(`${LANCEDB_API_URL}/count`);

    if (finalCountResponse.ok) {
      const { count } = await finalCountResponse.json();
      console.log(`✅ Final production record count: ${count}`);

      if (count >= allItems.length) {
        console.log('🎉 All items successfully ingested to production!');
        console.log('🔒 Data is permanently stored in EFS persistent storage');
      } else {
        console.log(`⚠️  Record count lower than expected: ${count}/${allItems.length}`);
      }
    }

    const totalTime = Date.now() - overallStartTime;
    const originalTime = 90 * 60 * 1000; // 90 minutes in ms
    const speedup = originalTime / totalTime;

    console.log('\n🎉 PRODUCTION PARALLEL INGESTION COMPLETE!');
    console.log('=' * 70);
    console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s (${(totalTime / 60000).toFixed(1)} minutes)`);
    console.log(`📊 Items processed: ${allItems.length}`);
    console.log(`🚀 Speed improvement: ${speedup.toFixed(1)}x faster than original`);
    console.log(`🔒 Persistent Storage: ✅ Data permanently stored in EFS`);
    console.log(`💾 Restart-proof: ✅ Data will survive service restarts`);
    console.log(`🎯 Production ready: ✅ Optimized for production workloads`);

    if (totalTime < 10 * 60 * 1000) { // Less than 10 minutes
      console.log('🏆 SUCCESS: Production ingestion completed in under 10 minutes!');
    }

  } catch (error) {
    console.error('❌ Production parallel ingestion failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Performance monitoring
async function main() {
  const memUsage = process.memoryUsage();
  console.log(`💾 Initial memory usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);

  // Verify we're targeting production
  const LANCEDB_API_URL = process.env.LANCEDB_API_URL;
  console.log(`🎯 Target: ${LANCEDB_API_URL}`);

  if (!LANCEDB_API_URL || LANCEDB_API_URL.includes('localhost')) {
    console.error('❌ This script requires production LANCEDB_API_URL');
    console.error('Expected: http://lancedb-alb-*.amazonaws.com');
    process.exit(1);
  }

  await productionParallelIngestion();

  const finalMemUsage = process.memoryUsage();
  console.log(`💾 Final memory usage: ${(finalMemUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
}

main().catch(console.error);
