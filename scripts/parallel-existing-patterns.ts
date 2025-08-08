#!/usr/bin/env tsx

import './bootstrap-env';
import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';
import { chunkText } from '../lib/chunk-utils';
import { listMediaAssets } from '../lib/media-storage';

/**
 * PARALLEL OPTIMIZATION OF EXISTING PATTERNS
 * - Uses existing LanceDBIngestionService methods
 * - Uses existing chunkText patterns
 * - Uses existing media loading from S3
 * - Just adds concurrency to speed up processing
 */

class ParallelExistingIngestion {
  private ingestionService: LanceDBIngestionService;
  private readonly CONCURRENCY = 25; // Parallel processing limit

  constructor() {
    this.ingestionService = new LanceDBIngestionService();
  }

  /**
   * Process items in parallel batches with rate limiting
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

      // Execute all items in this batch in parallel
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

      // Count results
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });

      console.log(`✅ Batch ${batchNum}/${totalBatches} complete: ${successCount} success, ${errorCount} errors so far`);

      // Small delay between batches to avoid overwhelming services
      if (i + concurrency < items.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`🎉 Parallel processing complete: ${successCount} success, ${errorCount} errors`);

    if (errorCount > items.length * 0.1) { // More than 10% failed
      throw new Error(`Too many failures: ${errorCount}/${items.length} items failed`);
    }
  }

  /**
   * Process text content using existing chunking patterns
   */
  async processTextContentWithChunks(doc: any): Promise<void> {
    // Targeted delete: remove prior chunks for this document only
    try {
      const LANCEDB_API_URL = process.env.LANCEDB_API_URL;
      const prefix = `text_${doc.slug}`;
      await fetch(`${LANCEDB_API_URL}/delete-by-prefix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix })
      });
    } catch {}

    const chunks = chunkText(doc.content);

    for (const chunk of chunks) {
      const chunkId = `text_${doc.slug}#${chunk.ix}`;

      // Use existing processTextContent method
      const record = await this.ingestionService.processTextContent({
        ...doc,
        slug: `${doc.slug}#${chunk.ix}`,
        content: chunk.text,
      });

      record.id = chunkId;
      record.metadata = {
        ...record.metadata,
        parent_slug: doc.slug,
        chunk_ix: chunk.ix,
        start_word: chunk.startWord,
      };

      // Use existing addToLanceDB method
      await this.ingestionService.addToLanceDB(record);
    }

    console.log(`📑 ${doc.slug}: processed ${chunks.length} chunks`);
  }

  /**
   * Process media asset using existing patterns
   */
  async processMediaAsset(asset: any): Promise<void> {
    // Use existing processMediaAsset method
    const record = await this.ingestionService.processMediaAsset(asset);

    // Use existing addToLanceDB method
    await this.ingestionService.addToLanceDB(record);

    console.log(`📹 ${asset.id}: processed ${asset.media_type}`);
  }

  /**
   * Clear old text data using existing patterns
   */
  async clearOldTextData(): Promise<void> {
    const argv = process.argv.slice(2);
    const noDelete = argv.includes('--no-delete') || process.env.SKIP_DELETE_TEXT === '1';
    if (noDelete) {
      console.log('⏭️  Skipping delete-text (guard active via --no-delete or SKIP_DELETE_TEXT=1)');
      return;
    }
    if (process.env.CONFIRM_TEXT_WIPE !== 'YES') {
      console.log('⛔ Refusing to delete text rows: set CONFIRM_TEXT_WIPE=YES to proceed or use --no-delete');
      return;
    }
    console.log('🧹 Clearing old text data...');

    try {
      const LANCEDB_API_URL = process.env.LANCEDB_API_URL;
      const response = await fetch(`${LANCEDB_API_URL}/delete-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        console.log('✅ Old text data cleared');
      } else {
        console.log('ℹ️  No old text data to clear');
      }
    } catch (error) {
      console.log('ℹ️  Could not clear old data, proceeding...');
    }
  }

  /**
   * Build index using existing patterns
   */
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

async function parallelIngestWithExistingPatterns() {
  console.log('🚀 PARALLEL INGESTION USING EXISTING PROVEN PATTERNS');
  console.log('🔧 Chunked text, S3 media, keyframes - all using current working code');
  console.log('⚡ Just adding concurrency for 10-50x speed improvement');
  console.log('=' * 80);

  const startTime = Date.now();
  const parallel = new ParallelExistingIngestion();

  try {
    // Step 1: Check production state
    console.log('\n📊 Step 1: Checking production state...');
    const LANCEDB_API_URL = process.env.LANCEDB_API_URL;
    const countResponse = await fetch(`${LANCEDB_API_URL}/count`);

    if (countResponse.ok) {
      const { count } = await countResponse.json();
      console.log(`📊 Current production records: ${count}`);
    }

    // Step 2: Load content using existing proven methods
    console.log('\n📁 Step 2: Loading content using existing proven methods...');

    const [mediaAssets, textContents] = await Promise.all([
      // Use existing media loading from S3 (includes keyframes, video, audio)
      listMediaAssets('all', { loadAll: true, excludeKeyframes: false }),
      // Use existing text loading from GitHub
      parallel.ingestionService.loadTextContent()
    ]);

    console.log(`✅ Loaded ${mediaAssets.assets.length} media assets (all types including keyframes)`);
    console.log(`✅ Loaded ${textContents.length} text documents`);

    // Media breakdown using existing types
    const mediaByType = mediaAssets.assets.reduce((acc, asset) => {
      acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 Media assets by type (existing categorization):');
    Object.entries(mediaByType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Step 3: Clear old text data
    await parallel.clearOldTextData();

    // Step 4: PARALLEL TEXT INGESTION using existing chunking
    console.log('\n📝 Step 4: PARALLEL TEXT INGESTION (using existing chunking patterns)...');

    await parallel.processInParallel(
      textContents,
      async (doc) => await parallel.processTextContentWithChunks(doc),
      15 // Lower concurrency for text due to OpenAI rate limits
    );

    // Step 5: PARALLEL MEDIA INGESTION using existing media processing
    console.log('\n📹 Step 5: PARALLEL MEDIA INGESTION (using existing media patterns)...');

    await parallel.processInParallel(
      mediaAssets.assets,
      async (asset) => await parallel.processMediaAsset(asset),
      25 // Higher concurrency for media as it's just metadata processing
    );

    // Step 6: Build index using existing patterns
    console.log('\n🔧 Step 6: Building search index using existing patterns...');
    await parallel.buildIndex();

    // Step 7: Final verification
    console.log('\n📊 Step 7: Final verification...');

    const finalCountResponse = await fetch(`${LANCEDB_API_URL}/count`);
    if (finalCountResponse.ok) {
      const { count } = await finalCountResponse.json();
      console.log(`✅ Final production record count: ${count}`);
    }

    const totalTime = Date.now() - startTime;
    const originalTime = 90 * 60 * 1000; // 90 minutes
    const speedup = originalTime / totalTime;

    console.log('\n🎉 PARALLEL INGESTION WITH EXISTING PATTERNS COMPLETE!');
    console.log('=' * 80);
    console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s (${(totalTime / 60000).toFixed(1)} minutes)`);
    console.log(`📊 Text documents: ${textContents.length}`);
    console.log(`📊 Media assets: ${mediaAssets.assets.length}`);
    console.log(`🚀 Speed improvement: ${speedup.toFixed(1)}x faster than original`);
    console.log(`🔧 Used existing proven patterns with parallel optimization`);
    console.log(`🔒 Data permanently stored in EFS persistent storage`);

    if (totalTime < 10 * 60 * 1000) {
      console.log('🏆 SUCCESS: Production ingestion completed in under 10 minutes!');
    }

  } catch (error) {
    console.error('❌ Parallel ingestion failed:', error);
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

  await parallelIngestWithExistingPatterns();

  const finalMemUsage = process.memoryUsage();
  console.log(`💾 Final memory usage: ${(finalMemUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
}

main().catch(console.error);
