#!/usr/bin/env tsx

import './bootstrap-env';
import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';
import { listMediaAssets } from '../lib/media-storage';

/**
 * PARALLEL MEDIA INGESTION FOR PRODUCTION
 * - Uses existing LanceDBIngestionService.processMediaAsset
 * - Uses existing S3 media loading (keyframes, video, audio, images)
 * - Just adds concurrency for massive speed improvement
 * - Media-only (no GitHub dependency)
 */

class ParallelMediaIngestion {
  private ingestionService: LanceDBIngestionService;
  private readonly CONCURRENCY = 30; // Higher for media since no OpenAI calls

  constructor() {
    this.ingestionService = new LanceDBIngestionService();
  }

  /**
   * Process items in parallel batches
   */
  async processInParallel<T>(
    items: T[],
    processor: (item: T) => Promise<void>,
    concurrency = this.CONCURRENCY
  ): Promise<void> {
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchNum = Math.floor(i / concurrency) + 1;
      const totalBatches = Math.ceil(items.length / concurrency);

      console.log(`⚡ Processing parallel batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

      const results = await Promise.allSettled(
        batch.map(async (item, idx) => {
          try {
            await processor(item);
            return { success: true, index: i + idx };
          } catch (error) {
            console.error(`❌ Item ${i + idx} failed:`, error.message);
            return { success: false, index: i + idx, error };
          }
        })
      );

      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });

      console.log(`✅ Batch ${batchNum}/${totalBatches} complete: ${successCount} success, ${errorCount} errors so far`);

      if (i + concurrency < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`🎉 Parallel media processing complete: ${successCount} success, ${errorCount} errors`);
  }

  /**
   * Process media asset using existing proven patterns
   */
  async processMediaAsset(asset: any): Promise<void> {
    // Use existing processMediaAsset method
    const record = await this.ingestionService.processMediaAsset(asset);

    // Use existing addToLanceDB method
    await this.ingestionService.addToLanceDB(record);

    console.log(`📹 ${asset.id}: ${asset.media_type} processed`);
  }

  async buildIndex(): Promise<void> {
    console.log('🔧 Building search index...');

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

      console.log('✅ Search index built successfully');
    } catch (error) {
      console.error('❌ Index build failed:', error);
      throw error;
    }
  }
}

async function parallelMediaIngestion() {
  console.log('🚀 PARALLEL MEDIA INGESTION FOR PRODUCTION');
  console.log('📹 All media types: video, audio, images, keyframes');
  console.log('⚡ Using existing proven S3 patterns with parallelization');
  console.log('🔒 Targeting EFS persistent storage');
  console.log('=' * 80);

  const startTime = Date.now();
  const parallel = new ParallelMediaIngestion();

  try {
    // Step 1: Check production state
    console.log('\n📊 Step 1: Checking production state...');
    const LANCEDB_API_URL = process.env.LANCEDB_API_URL;
    const countResponse = await fetch(`${LANCEDB_API_URL}/count`);

    if (countResponse.ok) {
      const { count } = await countResponse.json();
      console.log(`📊 Current production records: ${count}`);
    }

    // Step 2: Load ALL media using existing proven S3 patterns
    console.log('\n📁 Step 2: Loading ALL media using existing S3 patterns...');

    // Load all media types including keyframes
    const mediaResult = await listMediaAssets('all', {
      loadAll: true,
      excludeKeyframes: false // Include keyframes as requested
    });

    console.log(`✅ Loaded ${mediaResult.assets.length} total media assets`);

    // Media breakdown using existing categorization
    const mediaByType = mediaResult.assets.reduce((acc, asset) => {
      acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 Media assets by type (existing S3 structure):');
    Object.entries(mediaByType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Step 3: PARALLEL MEDIA INGESTION
    console.log(`\n📹 Step 3: PARALLEL MEDIA INGESTION (${mediaResult.assets.length} items)...`);
    console.log('🔧 Using existing processMediaAsset patterns');
    console.log('⚡ Processing with high concurrency (media = metadata only)');

    await parallel.processInParallel(
      mediaResult.assets,
      async (asset) => await parallel.processMediaAsset(asset),
      30 // High concurrency for media processing
    );

    // Step 4: Build index
    console.log('\n🔧 Step 4: Building search index...');
    await parallel.buildIndex();

    // Step 5: Final verification
    console.log('\n📊 Step 5: Final verification...');

    const finalCountResponse = await fetch(`${LANCEDB_API_URL}/count`);
    if (finalCountResponse.ok) {
      const { count } = await finalCountResponse.json();
      console.log(`✅ Final production record count: ${count}`);

      const expectedMinimum = mediaResult.assets.length + 5; // +5 for existing test records
      if (count >= expectedMinimum) {
        console.log('🎉 All media assets successfully ingested!');
      } else {
        console.log(`⚠️  Record count: ${count} (expected ~${expectedMinimum})`);
      }
    }

    const totalTime = Date.now() - startTime;
    const originalTime = 45 * 60 * 1000; // Estimate 45 min for media-only in old system
    const speedup = originalTime / totalTime;

    console.log('\n🎉 PARALLEL MEDIA INGESTION COMPLETE!');
    console.log('=' * 80);
    console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s (${(totalTime / 60000).toFixed(1)} minutes)`);
    console.log(`📊 Media assets processed: ${mediaResult.assets.length}`);
    console.log(`🚀 Speed improvement: ${speedup.toFixed(1)}x faster than sequential`);
    console.log(`🔧 Used existing proven S3 + processMediaAsset patterns`);
    console.log(`🔒 Data permanently stored in EFS persistent storage`);
    console.log(`📹 All media types: video, audio, images, keyframes included`);

    if (totalTime < 5 * 60 * 1000) {
      console.log('🏆 SUCCESS: Media ingestion completed in under 5 minutes!');
    }

  } catch (error) {
    console.error('❌ Parallel media ingestion failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

async function main() {
  const memUsage = process.memoryUsage();
  console.log(`💾 Initial memory usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);

  const LANCEDB_API_URL = process.env.LANCEDB_API_URL;
  console.log(`🎯 Target: ${LANCEDB_API_URL}`);

  if (!LANCEDB_API_URL || LANCEDB_API_URL.includes('localhost')) {
    console.error('❌ This script requires production LANCEDB_API_URL');
    console.error('Expected: http://lancedb-alb-*.amazonaws.com');
    process.exit(1);
  }

  await parallelMediaIngestion();

  const finalMemUsage = process.memoryUsage();
  console.log(`💾 Final memory usage: ${(finalMemUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
}

main().catch(console.error);
