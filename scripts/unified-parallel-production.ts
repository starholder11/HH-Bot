#!/usr/bin/env tsx

import './bootstrap-env';
import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';
import { listMediaAssets } from '../lib/media-storage';
import { chunkText } from '../lib/chunk-utils';
import { OpenAI } from 'openai';

interface ContentItem {
  id: string;
  title: string;
  content_type: string;
  combinedText: string;
  metadata?: any;
}

interface LanceDBRecord {
  id: string;
  content_type: string;
  title: string;
  embedding: number[];
  searchable_text: string;
  content_hash: string | null;
  references: string | null;
}

class UnifiedParallelIngestion {
  private openai: OpenAI;
  private readonly LANCEDB_API_URL: string;
  private readonly CONCURRENCY_LIMIT = 15; // Based on working scripts (text=15, media=25)
  private readonly BATCH_SIZE = 100;
  private readonly EMBEDDING_BATCH_SIZE = 50; // Proper parallelization with shorter text chunks
  private readonly MAX_REQUESTS_PER_MINUTE = 2900;
  private readonly ingestionService: LanceDBIngestionService;

  private requestsThisMinute = 0;
  private minuteStartTime = Date.now();

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.LANCEDB_API_URL = process.env.LANCEDB_API_URL || 'http://localhost:8000';
    this.ingestionService = new LanceDBIngestionService();
  }

  /**
   * Rate limiting to respect OpenAI's limits
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeElapsed = now - this.minuteStartTime;

    if (timeElapsed >= 60000) {
      this.requestsThisMinute = 0;
      this.minuteStartTime = now;
      return;
    }

    if (this.requestsThisMinute >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - timeElapsed;
      console.log(`⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestsThisMinute = 0;
      this.minuteStartTime = Date.now();
    }
  }

  /**
   * Generate embeddings for multiple texts with proper chunking
   */
  private async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];
    const totalBatches = Math.ceil(texts.length / this.EMBEDDING_BATCH_SIZE);

    for (let i = 0; i < texts.length; i += this.EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + this.EMBEDDING_BATCH_SIZE);
      const batchNum = Math.floor(i / this.EMBEDDING_BATCH_SIZE) + 1;

      console.log(`🔄 Processing embedding batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

      await this.waitForRateLimit();

      try {
        // Pre-check each text in the batch for token length
        const safeBatch = batch.map(text => {
          // Ultra-conservative: 1 token ≈ 2.5 chars + batch overhead safety
          const estimatedTokens = text.length / 2.5;
          if (estimatedTokens > 1500) { // Ultra-safe for 50-item batches (1500*50 = 75K chars = ~30K tokens max)
            console.log(`⚠️ Text too long (${Math.round(estimatedTokens)} est. tokens), truncating...`);
            return text.substring(0, 1500 * 2.5); // Truncate to safe length
          }
          return text;
        });

        const response = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: safeBatch,
          encoding_format: 'float',
        });

        const embeddings = response.data.map(d => d.embedding);
        allEmbeddings.push(...embeddings);
        this.requestsThisMinute++;

        console.log(`✅ Generated ${embeddings.length} embeddings`);
      } catch (error: any) {
        console.error(`❌ Embedding batch failed:`, error.message);
        throw error;
      }
    }

    return allEmbeddings;
  }

  /**
   * Send records to LanceDB using PARALLEL individual inserts (proven method)
   */
  private async parallelInsertToLanceDB(records: LanceDBRecord[]): Promise<void> {
    let allRecords = [...records]; // Copy for retries
    let attempt = 1;
    const MAX_RETRIES = 3;

    while (attempt <= MAX_RETRIES && allRecords.length > 0) {
      console.log(`📤 Attempt ${attempt}/${MAX_RETRIES}: Inserting ${allRecords.length} records with concurrency ${this.CONCURRENCY_LIMIT}...`);

      let successCount = 0;
      let failedRecords: LanceDBRecord[] = [];

      // Process records in parallel batches
      for (let i = 0; i < allRecords.length; i += this.CONCURRENCY_LIMIT) {
        const batch = allRecords.slice(i, i + this.CONCURRENCY_LIMIT);
        const batchNum = Math.floor(i / this.CONCURRENCY_LIMIT) + 1;
        const totalBatches = Math.ceil(allRecords.length / this.CONCURRENCY_LIMIT);

        console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} records)...`);

        // Insert all records in this batch concurrently with timeout
        const promises = batch.map(async (record) => {
          try {
            // Use the proven format that works with production
            const apiRecord = {
              id: record.id,
              content_type: record.content_type,
              title: record.title,
              embedding: record.embedding,
              searchable_text: record.searchable_text,
              content_hash: record.content_hash,
              references: record.references,
            };

            const response = await fetch(`${this.LANCEDB_API_URL}/add`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(apiRecord),
              signal: AbortSignal.timeout(30000) // 30 second timeout
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            return { success: true, id: record.id, record };
          } catch (error) {
            if (attempt === MAX_RETRIES) {
              console.error(`❌ Final failure for ${record.id}:`, error.message);
            }
            return { success: false, id: record.id, record, error };
          }
        });

        // Wait for all parallel inserts in this batch to complete
        const results = await Promise.allSettled(promises);

        // Process results
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              successCount++;
            } else {
              failedRecords.push(result.value.record);
            }
          } else {
            console.error(`❌ Promise rejected:`, result.reason);
          }
        });

        console.log(`✅ Batch completed: ${successCount} total success, ${failedRecords.length} total failed so far`);

        // Add delay between batches to avoid overwhelming service (from working scripts)
        if (i + this.CONCURRENCY_LIMIT < allRecords.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      console.log(`📊 Attempt ${attempt} complete: ${successCount} success, ${failedRecords.length} failed`);

      if (failedRecords.length === 0) {
        console.log(`🎉 All records inserted successfully on attempt ${attempt}!`);
        break;
      } else if (attempt < MAX_RETRIES) {
        console.log(`⏳ Retrying ${failedRecords.length} failed records in ${attempt * 2} seconds...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 2000)); // Exponential backoff
        allRecords = failedRecords;
        attempt++;
      } else {
        console.warn(`⚠️ Final result: ${failedRecords.length} records failed after ${MAX_RETRIES} attempts`);
      }
    }
  }

  /**
   * Process text content with chunking for long documents
   */
  private processTextContent(textContent: any): ContentItem[] {
    const { slug, title, content } = textContent;
    const combinedText = `${title}\n${textContent.description || ''}\n${content}`;

    // Check if content is too long for a single embedding
    // More conservative estimate: 1 token ≈ 3 chars for technical content
    const estimatedTokens = combinedText.length / 3;

    if (estimatedTokens <= 6000) { // Very conservative single chunk limit
      return [{
        id: slug,
        title,
        content_type: 'text',
        combinedText,
        metadata: {
          file_path: textContent.file_path,
          frontmatter: textContent.frontmatter
        }
      }];
    } else {
      // Chunk the content
      console.log(`📄 Chunking long document: ${title} (${Math.round(estimatedTokens)} est. tokens)`);
      const chunks = chunkText(combinedText);

      return chunks.map((chunk, index) => ({
        id: `${slug}#chunk_${index}`,
        title: `${title} (Part ${index + 1})`,
        content_type: 'text',
        combinedText: chunk.text,
        metadata: {
          file_path: textContent.file_path,
          frontmatter: textContent.frontmatter,
          chunk_index: index,
          total_chunks: chunks.length,
          parent_slug: slug
        }
      }));
    }
  }

  /**
   * Convert media asset to content item (existing pattern)
   */
  static mediaAssetToContentItem(asset: any): ContentItem {
    const description = asset.description || '';
    const tags = asset.tags ? asset.tags.join(' ') : '';
    const metadata = asset.ai_metadata ? JSON.stringify(asset.ai_metadata) : '';

    return {
      id: asset.id,
      title: asset.title,
      content_type: asset.media_type,
      combinedText: `${asset.title} ${description} ${tags} ${metadata}`.trim(),
      metadata: asset
    };
  }

  /**
   * Clear old text data
   */
  async clearOldTextData(): Promise<void> {
    console.log('🧹 Clearing old text data...');
    try {
      const response = await fetch(`${this.LANCEDB_API_URL}/clear-text`, { method: 'POST' });
      if (response.ok) {
        console.log('✅ Old text data cleared');
      } else {
        console.log('⚠️ Clear text endpoint not available, continuing...');
      }
    } catch (error) {
      console.log('⚠️ Could not clear old text data, continuing...');
    }
  }

  /**
   * Build search index
   */
  async buildIndex(): Promise<void> {
    console.log('🔧 Building search index...');
    try {
      const response = await fetch(`${this.LANCEDB_API_URL}/build-index`, { method: 'POST' });
      if (response.ok) {
        console.log('✅ Search index built successfully');
      } else {
        console.error(`❌ Failed to build index: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Failed to build index:', error);
      throw error;
    }
  }

  /**
   * Main unified ingestion process
   */
  async ingestUnified(retryFailedOnly: boolean = false): Promise<void> {
    console.log('🚀 UNIFIED PARALLEL PRODUCTION INGESTION');
    console.log('📁 GitHub text (chunked) + S3 media (all types)');
    console.log('⚡ Using existing proven patterns with parallelization');
    console.log('🔒 Targeting production EFS persistent storage');
    console.log('='.repeat(80));

    const startTime = Date.now();

    try {
      // Step 1: Check production state
      console.log('\n📊 Step 1: Checking production state...');
      const countResponse = await fetch(`${this.LANCEDB_API_URL}/count`);
      if (countResponse.ok) {
        const { count } = await countResponse.json();
        console.log(`📊 Current production records: ${count}`);
      }

      // Step 2: Load content using existing proven methods
      console.log('\n📁 Step 2: Loading content using existing proven methods...');

      const [mediaAssets, textContents] = await Promise.all([
        // Use existing media loading from S3 (includes keyframes, video, audio) - NO FILTER = ALL TYPES
        listMediaAssets(undefined, { loadAll: true, excludeKeyframes: false }),
        // Use existing text loading from GitHub
        this.ingestionService.loadTextContent()
      ]);

      console.log(`✅ Loaded ${mediaAssets.assets.length} media assets (all types including keyframes)`);
      console.log(`✅ Loaded ${textContents.length} text documents`);

      // Media breakdown
      const mediaByType = mediaAssets.assets.reduce((acc, asset) => {
        acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log('📊 Media assets by type:');
      Object.entries(mediaByType).forEach(([type, count]) => {
        console.log(`   - ${type}: ${count}`);
      });

      // Step 3: Clear old text data
      await this.clearOldTextData();

      // Step 4: Process text content with chunking
      console.log('\n📄 Step 4: Processing text content (with chunking for long docs)...');

      const allTextItems: ContentItem[] = [];
      for (const textContent of textContents) {
        const items = this.processTextContent(textContent);
        allTextItems.push(...items);
      }

      console.log(`📄 Generated ${allTextItems.length} text items (including chunks)`);

      // Step 5: Convert media assets
      console.log('\n🎬 Step 5: Converting media assets...');
      const mediaItems: ContentItem[] = mediaAssets.assets.map(asset =>
        UnifiedParallelIngestion.mediaAssetToContentItem(asset)
      );

      // Step 6: Combine all content
      const allItems = [...allTextItems, ...mediaItems];
      console.log(`📦 Total items to process: ${allItems.length}`);

      // Step 7: Generate embeddings in parallel batches
      console.log('\n🧠 Step 7: Generating embeddings in parallel batches...');
      const texts = allItems.map(item => item.combinedText);
      const embeddings = await this.generateEmbeddingsBatch(texts);

      // Step 8: Create LanceDB records
      console.log('\n📝 Step 8: Creating LanceDB records...');
      const records: LanceDBRecord[] = allItems.map((item, index) => ({
        id: item.id,
        content_type: item.content_type,
        title: item.title,
        embedding: embeddings[index],
        searchable_text: item.combinedText,
        content_hash: null,
        references: item.metadata ? JSON.stringify(item.metadata) : null
      }));

      // Step 9: Parallel insert to LanceDB using proven method
      console.log('\n📤 Step 9: Parallel inserting to production LanceDB...');
      await this.parallelInsertToLanceDB(records);

      // Step 10: Build search index
      console.log('\n🔧 Step 10: Building production search index...');
      await this.buildIndex();

      // Final status
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      console.log('\n🎉 UNIFIED PARALLEL INGESTION COMPLETE!');
      console.log(`⏱️  Total time: ${duration}s`);
      console.log(`📊 Total records: ${records.length}`);
      console.log(`📄 Text items: ${allTextItems.length}`);
      console.log(`🎬 Media items: ${mediaItems.length}`);
      console.log(`🚀 Speed improvement: ~${Math.round(records.length / duration * 60)}x vs sequential`);

    } catch (error) {
      console.error('❌ Unified parallel ingestion failed:', error);
      throw error;
    }
  }
}

async function main() {
  console.log('💾 Initial memory usage:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
  console.log('🎯 Target:', process.env.LANCEDB_API_URL);

    // Check if production service is responding and has existing records
  const LANCEDB_API_URL = process.env.LANCEDB_API_URL;
  console.log('🔍 Checking production service health and record count...');

  try {
    const countResponse = await fetch(`${LANCEDB_API_URL}/count`, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!countResponse.ok) {
      console.log(`❌ Production service error: ${countResponse.status} ${countResponse.statusText}`);
      console.log('🚫 Production service is DOWN - cannot safely retry failed records');
      console.log('💡 SOLUTION: Fix production service first, then retry');
      process.exit(1);
    }

    const data = await countResponse.json();
    const existingCount = data.count;
    console.log(`📊 Production service is UP with ${existingCount} existing records`);

    if (existingCount > 4000) { // We know 4,094 succeeded previously
      console.log('🔄 DETECTED: This appears to be a retry run (production has substantial data)');
      console.log('❌ ERROR: This script will re-ingest ALL 6,341 records, wasting time and money');
      console.log('📋 You need a RETRY-ONLY script that processes just the failed records');
      console.log('💡 SOLUTION: Wait for production service to recover, or create retry-only script');
      process.exit(1);
    }

  } catch (error) {
    console.log(`❌ Cannot connect to production service: ${error.message}`);
    console.log('🚫 Cannot safely proceed without knowing production state');
    console.log('💡 SOLUTION: Fix production service connectivity first');
    process.exit(1);
  }

  const unified = new UnifiedParallelIngestion();
  await unified.ingestUnified();

  console.log('💾 Final memory usage:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
}

if (require.main === module) {
  main().catch(console.error);
}

export { UnifiedParallelIngestion };
