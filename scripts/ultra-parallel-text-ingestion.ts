#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';
import { chunkText } from '../lib/chunk-utils';
import { generateEmbeddings } from '../lib/ingestion/OpenAIEmbedder';
import './bootstrap-env';

interface ChunkRecord {
  id: string;
  title: string;
  content_type: string;
  text: string;
  metadata: any;
}

class UltraParallelIngestion {
  private readonly LANCEDB_API_URL = process.env.LANCEDB_API_URL || 'http://localhost:8000';
  private readonly EMBEDDING_WORKERS = 12; // Parallel embedding workers
  private readonly EMBEDDING_BATCH_SIZE = 20; // Embeddings per API call
  private readonly LANCEDB_BATCH_SIZE = 100; // Records per LanceDB insert
  private readonly MAX_RETRIES = 3;

  async run() {
    console.log('🚀 ULTRA PARALLEL TEXT INGESTION');
    console.log(`⚡ ${this.EMBEDDING_WORKERS} embedding workers`);
    console.log(`📦 ${this.EMBEDDING_BATCH_SIZE} embeddings per OpenAI call`);
    console.log(`💾 ${this.LANCEDB_BATCH_SIZE} records per LanceDB batch`);

    // Step 1: Load and chunk all text content
    const legacyService = new LanceDBIngestionService();
    console.log('\n📄 Loading text content...');
    const textContents = await legacyService.loadTextContent();
    console.log(`✅ Loaded ${textContents.length} documents`);

    // Step 2: Generate all chunks upfront
    console.log('\n🔪 Chunking all documents...');
    const allChunks: ChunkRecord[] = [];

    for (const doc of textContents) {
      const chunks = chunkText(doc.content);
      for (const chunk of chunks) {
        allChunks.push({
          id: `text_${doc.slug}#${chunk.ix}`,
          title: doc.title,
          content_type: 'text',
          text: chunk.text,
          metadata: {
            parent_slug: doc.slug,
            chunk_ix: chunk.ix,
            start_word: chunk.startWord,
            frontmatter: doc.frontmatter,
            file_path: doc.file_path,
          }
        });
      }
    }

    console.log(`✅ Generated ${allChunks.length} chunks total`);

    // Step 3: Process chunks in parallel with workers
    console.log(`\n⚡ Starting ${this.EMBEDDING_WORKERS} parallel workers...`);
    const results = await this.processChunksInParallel(allChunks);
    console.log(`✅ Processed ${results.length} chunks successfully`);

    // Step 4: Bulk insert to LanceDB
    console.log('\n💾 Bulk inserting to LanceDB...');
    await this.bulkInsertToLanceDB(results);
    console.log('✅ Ultra parallel ingestion complete!');
  }

  private async processChunksInParallel(chunks: ChunkRecord[]): Promise<any[]> {
    const workers: Promise<any[]>[] = [];
    const chunkSize = Math.ceil(chunks.length / this.EMBEDDING_WORKERS);

    for (let i = 0; i < this.EMBEDDING_WORKERS; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, chunks.length);
      const workerChunks = chunks.slice(start, end);

      if (workerChunks.length > 0) {
        console.log(`🔧 Worker ${i + 1}: Processing ${workerChunks.length} chunks (${start}-${end-1})`);
        workers.push(this.processWorkerChunks(workerChunks, i + 1));
      }
    }

    const workerResults = await Promise.all(workers);
    return workerResults.flat();
  }

  private async processWorkerChunks(chunks: ChunkRecord[], workerId: number): Promise<any[]> {
    const results: any[] = [];
    const batches = this.createBatches(chunks, this.EMBEDDING_BATCH_SIZE);

    console.log(`👷 Worker ${workerId}: Processing ${batches.length} embedding batches`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchTexts = batch.map(c => c.text);

      try {
        // Generate embeddings for entire batch at once
        const embeddings = await this.withRetry(
          () => generateEmbeddings(batchTexts),
          `Worker ${workerId} batch ${i + 1}/${batches.length}`
        );

        // Create records with embeddings
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddings[j];

          results.push({
            id: chunk.id,
            content_type: chunk.content_type,
            title: chunk.title,
            embedding: embedding,
            searchable_text: chunk.text,
            content_hash: null,
            references: JSON.stringify(chunk.metadata)
          });
        }

        if (i % 10 === 0) {
          console.log(`👷 Worker ${workerId}: Completed ${i + 1}/${batches.length} batches (${results.length} records)`);
        }

      } catch (error) {
        console.error(`❌ Worker ${workerId} batch ${i + 1} failed:`, error);
        // Continue with other batches rather than failing completely
      }
    }

    console.log(`✅ Worker ${workerId}: Completed ${results.length} records`);
    return results;
  }

  private async bulkInsertToLanceDB(records: any[]): Promise<void> {
    const batches = this.createBatches(records, this.LANCEDB_BATCH_SIZE);
    console.log(`💾 Inserting ${batches.length} batches to LanceDB...`);

    // Process LanceDB batches in parallel too (but with lower concurrency to avoid 502s)
    const batchPromises: Promise<void>[] = [];
    const maxConcurrentBatches = 3;

    for (let i = 0; i < batches.length; i += maxConcurrentBatches) {
      const batchGroup = batches.slice(i, i + maxConcurrentBatches);

      const groupPromises = batchGroup.map(async (batch, groupIndex) => {
        const batchIndex = i + groupIndex;
        return this.withRetry(
          () => this.insertBatch(batch, batchIndex + 1, batches.length),
          `LanceDB batch ${batchIndex + 1}/${batches.length}`
        );
      });

      await Promise.all(groupPromises);
    }

    console.log(`✅ Successfully inserted ${records.length} records to LanceDB`);
  }

  private async insertBatch(batch: any[], batchNum: number, totalBatches: number): Promise<void> {
    const response = await fetch(`${this.LANCEDB_API_URL}/bulk-add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: batch })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LanceDB batch ${batchNum} failed: ${response.status} ${text}`);
    }

    console.log(`💾 Batch ${batchNum}/${totalBatches}: Inserted ${batch.length} records`);
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        console.warn(`⚠️  ${context} attempt ${attempt}/${maxRetries} failed:`, error.message);

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
          console.log(`🔄 Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`${context} failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function main() {
  try {
    const ingestion = new UltraParallelIngestion();
    await ingestion.run();
  } catch (error) {
    console.error('💥 Ultra parallel ingestion failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
