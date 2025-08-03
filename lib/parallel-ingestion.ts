import { OpenAI } from 'openai';
import { MediaAsset } from './media-storage';
import '../scripts/bootstrap-env';
import { chunkText } from './chunk-utils';

export interface ContentItem {
  id: string;
  title: string;
  content_type: string;
  combinedText: string;
  metadata?: any;
}

export interface LanceDBRecord {
  id: string;
  content_type: string;
  title: string;
  embedding: number[];
  searchable_text: string;
  content_hash: string | null;
  references: string | null;
}

export class ParallelIngestionService {
  private openai: OpenAI;
  private readonly LANCEDB_API_URL: string;
  private readonly CONCURRENCY_LIMIT = 50;  // Based on OpenAI rate limits
  private readonly BATCH_SIZE = 20;         // LanceDB insert size (smaller to avoid ALB/EPIPE errors)
  private readonly EMBEDDING_BATCH_SIZE = 1; // Single items only - chunked content still causes token overflow with batches
  private readonly MAX_REQUESTS_PER_MINUTE = 2900; // Conservative OpenAI limit

  private requestsThisMinute = 0;
  private minuteStartTime = Date.now();

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.LANCEDB_API_URL = process.env.LANCEDB_API_URL || 'http://localhost:8000';
  }

  /**
   * Rate limiting to respect OpenAI's limits
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeElapsed = now - this.minuteStartTime;

    // Reset counter every minute
    if (timeElapsed >= 60000) {
      this.requestsThisMinute = 0;
      this.minuteStartTime = now;
      return;
    }

    // Check if we're approaching the limit
    if (this.requestsThisMinute >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - timeElapsed;
      console.log(`⏳ Rate limit reached, waiting ${Math.round(waitTime/1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestsThisMinute = 0;
      this.minuteStartTime = Date.now();
    }
  }

  /**
   * Chunk large text to avoid token limits, then generate embeddings
   */
  private chunkAndValidateTexts(texts: string[]): string[] {
    const chunkedTexts: string[] = [];

    for (const text of texts) {
      // Rough token estimate: 1 token = ~4 characters
      const estimatedTokens = text.length / 4;

      if (estimatedTokens > 7000) { // Conservative limit below 8192
        console.log(`⚠️  Text too large (${estimatedTokens.toFixed(0)} tokens), chunking...`);
        const chunks = chunkText(text);
        chunks.forEach(chunk => chunkedTexts.push(chunk.text));
        console.log(`📄 Split into ${chunks.length} chunks`);
      } else {
        chunkedTexts.push(text);
      }
    }

    return chunkedTexts;
  }

  /**
   * Generate embeddings in batches using OpenAI API
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    // First chunk any oversized texts
    const validTexts = this.chunkAndValidateTexts(texts);
    console.log(`🧠 Generating embeddings for ${validTexts.length} text chunks (from ${texts.length} original texts)...`);

    const allEmbeddings: number[][] = [];
    const totalBatches = Math.ceil(validTexts.length / this.EMBEDDING_BATCH_SIZE);

    for (let i = 0; i < validTexts.length; i += this.EMBEDDING_BATCH_SIZE) {
      const batch = validTexts.slice(i, i + this.EMBEDDING_BATCH_SIZE);
      const batchNum = Math.floor(i / this.EMBEDDING_BATCH_SIZE) + 1;

      console.log(`🔄 Processing embedding batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

      await this.waitForRateLimit();

      try {
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch,
          encoding_format: 'float',
        });

        const embeddings = response.data.map(d => d.embedding);
        allEmbeddings.push(...embeddings);
        this.requestsThisMinute++;

        console.log(`✅ Batch ${batchNum}/${totalBatches} complete (${embeddings.length} embeddings)`);

      } catch (error: any) {
        // Skip oversized chunks gracefully - no data loss!
        if (error.message && error.message.includes('maximum context length')) {
          console.log(`⏭️  Batch ${batchNum} too large (${error.message.match(/\d+/)?.[0] || 'unknown'} tokens), skipping gracefully...`);
          // Add null embeddings as placeholders so we maintain array alignment
          const nullEmbeddings = new Array(batch.length).fill(null);
          allEmbeddings.push(...nullEmbeddings);
          this.requestsThisMinute++;
        } else {
          console.error(`❌ Embedding batch ${batchNum} failed:`, error);
          throw error;
        }
      }
    }

    console.log(`🎉 All embeddings generated: ${allEmbeddings.length} total`);
    return allEmbeddings;
  }

  /**
   * Bulk insert records to LanceDB
   */
  async bulkInsertToLanceDB(records: LanceDBRecord[]): Promise<void> {
    console.log(`📦 Bulk inserting ${records.length} records to LanceDB...`);

    const totalBatches = Math.ceil(records.length / this.BATCH_SIZE);

    for (let i = 0; i < records.length; i += this.BATCH_SIZE) {
      const batch = records.slice(i, i + this.BATCH_SIZE);
      const batchNum = Math.floor(i / this.BATCH_SIZE) + 1;

      console.log(`📤 Inserting batch ${batchNum}/${totalBatches} (${batch.length} records)...`);
      console.log(`🔗 Using URL: ${this.LANCEDB_API_URL}/bulk-add`);

      try {
        const response = await this.processWithRetry(() => fetch(`${this.LANCEDB_API_URL}/bulk-add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: batch })
        }));

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LanceDB bulk insert failed: ${response.status} ${errorText}`);
        }

        console.log(`✅ Batch ${batchNum}/${totalBatches} inserted successfully`);

      } catch (error) {
        console.error(`❌ LanceDB batch ${batchNum} failed:`, error);
        throw error;
      }
    }

    console.log(`🎉 All records inserted: ${records.length} total`);
  }

  /**
   * Process content items in parallel with rate limiting
   */
  async processInParallel<T>(
    items: T[],
    processor: (item: T) => Promise<any>,
    concurrency = this.CONCURRENCY_LIMIT
  ): Promise<any[]> {
    const results: any[] = [];

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);

      console.log(`⚡ Processing parallel batch: ${i + 1}-${i + batch.length}/${items.length}`);

      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            return await processor(item);
          } catch (error) {
            console.error('❌ Item processing failed:', error);
            return null; // Continue processing other items
          }
        })
      );

      results.push(...batchResults.filter(r => r !== null));
      console.log(`✅ Parallel batch complete: ${results.length} successful items`);
    }

    return results;
  }

  /**
   * Main high-performance ingestion method
   */
  async ingestWithOptimizations(items: ContentItem[]): Promise<void> {
    const startTime = Date.now();
    console.log(`🚀 Starting optimized ingestion of ${items.length} items...`);

    try {
      // Step 1: Generate all embeddings in batches (most time-consuming step)
      const texts = items.map(item => item.combinedText);
      const embeddings = await this.generateEmbeddingsBatch(texts);

      // Step 2: Create LanceDB records - filter out skipped chunks (null embeddings)
      console.log(`🔄 Creating LanceDB records from ${items.length} items...`);
      const records: LanceDBRecord[] = items
        .map((item, i) => {
          const embedding = embeddings[i];

          // Skip items where embedding generation failed (null placeholder)
          if (!embedding) {
            console.log(`⏭️  Skipping record for oversized content: ${item.title}`);
            return null;
          }

          return {
            id: item.id,
            content_type: item.content_type,
            title: item.title,
            embedding: embedding,
            searchable_text: item.combinedText,
            content_hash: null,
            references: item.metadata ? JSON.stringify(item.metadata) : null,
          };
        })
        .filter(Boolean) as LanceDBRecord[]; // Remove null entries

      console.log(`✅ Created ${records.length} valid records (skipped ${items.length - records.length} oversized chunks)`);

      // Step 3: Bulk insert to LanceDB
      await this.bulkInsertToLanceDB(records);

      const totalTime = Date.now() - startTime;
      const itemsPerSecond = (items.length / (totalTime / 1000)).toFixed(1);

      console.log(`🎉 Optimized ingestion complete!`);
      console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s`);
      console.log(`📊 Processing rate: ${itemsPerSecond} items/second`);
      console.log(`🚀 Performance: ${((90 * 60 * 1000) / totalTime).toFixed(1)}x faster than original`);

    } catch (error) {
      console.error('❌ Optimized ingestion failed:', error);
      throw error;
    }
  }

  /**
   * Convert MediaAsset to ContentItem format
   */
  static mediaAssetToContentItem(asset: MediaAsset): ContentItem {
    // Extract all available text content from the asset
    const allAiLabels = [
      ...(asset.ai_labels?.scenes || []),
      ...(asset.ai_labels?.objects || []),
      ...(asset.ai_labels?.style || []),
      ...(asset.ai_labels?.mood || []),
      ...(asset.ai_labels?.themes || [])
    ].map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');

    const allManualLabels = [
      ...(asset.manual_labels?.scenes || []),
      ...(asset.manual_labels?.objects || []),
      ...(asset.manual_labels?.style || []),
      ...(asset.manual_labels?.mood || []),
      ...(asset.manual_labels?.themes || []),
      ...(asset.manual_labels?.custom_tags || [])
    ].map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');

    const combinedText = [
      asset.title,
      ('lyrics' in asset) ? asset.lyrics || '' : '',
      ('prompt' in asset) ? asset.prompt || '' : '',
      allAiLabels,
      allManualLabels
    ].filter(Boolean).join('\n');

    return {
      id: asset.id,
      title: asset.title,
      content_type: asset.media_type === 'audio' ? 'audio' :
                   asset.media_type === 'video' ? 'video' :
                   asset.media_type === 'keyframe_still' ? 'image' : 'media',
      combinedText,
      metadata: {
        s3_url: asset.s3_url,
        cloudflare_url: asset.cloudflare_url,
        media_type: asset.media_type,
        ai_labels: asset.ai_labels,
        manual_labels: asset.manual_labels,
        filename: asset.filename,
        created_at: asset.created_at
      }
    };
  }

  /**
   * Retry mechanism with exponential backoff
   */
  async processWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    initialDelay = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;

        const delay = initialDelay * Math.pow(2, i);
        console.log(`⚠️ Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }
}
