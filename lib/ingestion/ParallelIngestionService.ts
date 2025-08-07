import { MediaAsset } from '../media-storage';
import { chunkText } from '../chunk-utils';
import { generateEmbeddings } from './OpenAIEmbedder';

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

/**
 * Production-ready copy of the original ParallelIngestionService.
 * The code is identical except for:
 *   1.  Removal of the dev-only "bootstrap-env" import.
 *   2.  Updated relative import paths (now that the file lives in lib/ingestion/).
 *
 *  The original file in lib/parallel-ingestion.ts remains untouched so that
 *  existing CLI scripts continue to work without changes.
 */
export class ParallelIngestionService {
  private readonly LANCEDB_API_URL: string;
  private readonly CONCURRENCY_LIMIT = 50;  // Based on OpenAI rate limits
  private readonly BATCH_SIZE = 20;         // LanceDB insert size (smaller to avoid ALB/EPIPE errors)
  private readonly EMBEDDING_BATCH_SIZE = 1; // Single items only – chunked content still causes token overflow with batches
  private readonly MAX_REQUESTS_PER_MINUTE = 2900; // Conservative OpenAI limit

  private requestsThisMinute = 0;
  private minuteStartTime = Date.now();

  constructor() {
    // Match unified-search: prefer public LANCEDB_URL, then LANCEDB_API_URL, else localhost
    this.LANCEDB_API_URL =
      (process.env.LANCEDB_URL as string) ||
      process.env.LANCEDB_API_URL ||
      'http://localhost:8000';
  }



  /* ---------------- Rate-limit helper ---------------- */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.minuteStartTime;

    if (elapsed >= 60_000) {
      this.requestsThisMinute = 0;
      this.minuteStartTime = now;
      return;
    }
    if (this.requestsThisMinute >= this.MAX_REQUESTS_PER_MINUTE) {
      const wait = 60_000 - elapsed;
      console.log(`⏳ Rate limit reached, waiting ${Math.round(wait / 1000)}s…`);
      await new Promise(r => setTimeout(r, wait));
      this.requestsThisMinute = 0;
      this.minuteStartTime = Date.now();
    }
  }

  /* --------------- Embedding generation -------------- */
  private chunkAndValidateTexts(texts: string[]): string[] {
    const out: string[] = [];
    for (const t of texts) {
      const estTokens = t.length / 4; // rough
      if (estTokens > 7000) {
        console.log(`⚠️  Text too large (${estTokens.toFixed(0)} tokens) – chunking…`);
        chunkText(t).forEach(c => out.push(c.text));
      } else {
        out.push(t);
      }
    }
    return out;
  }

  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const valid = this.chunkAndValidateTexts(texts);
    console.log(`🧠 Generating embeddings for ${valid.length} text chunks (from ${texts.length} originals)…`);

    // Use the exact same pattern as working ai-labeling
    return await generateEmbeddings(valid);
  }

  /* -------------- LanceDB bulk insert --------------- */
  async bulkInsertToLanceDB(records: LanceDBRecord[], isUpsert: boolean = false): Promise<void> {
        console.log(`📤 Bulk ${isUpsert ? 'upserting' : 'inserting'} ${records.length} records to LanceDB...`);
    // Server-side handles delete-before-add for upserts automatically

    // Optimize for single-record operations and ensure robust upsert behavior
    if (records.length === 1) {
      const rec = records[0];
      console.log(`📤 Using /add for single record id=${rec.id}`);
      const res = await this.processWithRetry(() => fetch(`${this.LANCEDB_API_URL}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rec),
      }));
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`LanceDB add failed: ${res.status} ${txt}`);
      }
      return;
    }

    const batches = Math.ceil(records.length / this.BATCH_SIZE);
    for (let i = 0; i < records.length; i += this.BATCH_SIZE) {
      const batch = records.slice(i, i + this.BATCH_SIZE);
      const n = Math.floor(i / this.BATCH_SIZE) + 1;
      console.log(`📤 Sending batch ${n}/${batches} to LanceDB (${batch.length} records)…`);

      const res = await this.processWithRetry(() => fetch(`${this.LANCEDB_API_URL}/bulk-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: batch }),
      }));
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`LanceDB bulk-add failed: ${res.status} ${txt}`);
      }
    }
  }

  /* ---------------- Main ingestion ------------------ */
  async ingestWithOptimizations(items: ContentItem[], isUpsert: boolean = false): Promise<void> {
    const start = Date.now();
    const embeddings = await this.generateEmbeddingsBatch(items.map(i => i.combinedText));

    const records = items.map((it, idx) => {
      const emb = embeddings[idx];
      if (!emb) return null;
      return {
        id: it.id,
        content_type: it.content_type,
        title: it.title,
        embedding: emb,
        searchable_text: it.combinedText,
        content_hash: null,
        references: it.metadata ? JSON.stringify(it.metadata) : null,
      } as LanceDBRecord;
    }).filter(Boolean) as LanceDBRecord[];

    await this.bulkInsertToLanceDB(records, isUpsert);
    console.log(`✅ ${isUpsert ? 'Upserted' : 'Ingested'} ${records.length} records in ${((Date.now()-start)/1000).toFixed(1)}s`);
  }

  /* --------- MediaAsset → ContentItem helper -------- */
    static mediaAssetToContentItem(asset: MediaAsset): ContentItem {
    const parts: string[] = [asset.title];

    if (asset.media_type === 'audio') {
      // Cast to AudioAsset to access lyrics and prompt properties
      const audioAsset = asset as any;
      console.log('🔍 Audio asset debug:', {
        id: asset.id,
        title: asset.title,
        lyricsValue: audioAsset.lyrics,
        lyricsLength: audioAsset.lyrics?.length || 0,
        promptValue: audioAsset.prompt,
        promptLength: audioAsset.prompt?.length || 0,
        allKeys: Object.keys(audioAsset)
      });
      
      // Add lyrics if present and non-empty
      if (audioAsset.lyrics && audioAsset.lyrics.trim()) {
        parts.push(audioAsset.lyrics);
        console.log('✅ Added lyrics to searchable content');
      } else {
        console.log('⚠️ No lyrics or empty lyrics');
      }
      
      // Add prompt if present and non-empty  
      if (audioAsset.prompt && audioAsset.prompt.trim()) {
        parts.push(audioAsset.prompt);
        console.log('✅ Added prompt to searchable content');
      } else {
        console.log('⚠️ No prompt or empty prompt');
      }
    }

    if (asset.media_type === 'video' && asset.ai_labels?.overall_analysis) {
      const oa = asset.ai_labels.overall_analysis;
      if (typeof oa === 'string') parts.push(oa);
      else if (typeof oa === 'object') parts.push(...Object.values(oa).filter(v => typeof v === 'string'));
    }

    const addLabels = (arr?: string[]) => { if (arr) parts.push(arr.join(' ')); };
    addLabels(asset.ai_labels?.scenes);
    addLabels(asset.ai_labels?.objects);
    addLabels(asset.ai_labels?.style);
    addLabels(asset.ai_labels?.mood);
    addLabels(asset.ai_labels?.themes);

    addLabels(asset.manual_labels?.scenes);
    addLabels(asset.manual_labels?.objects);
    addLabels(asset.manual_labels?.style);
    addLabels(asset.manual_labels?.mood);
    addLabels(asset.manual_labels?.themes);
    addLabels(asset.manual_labels?.custom_tags);

    const combinedText = parts.filter(p => p && p.trim()).join('\n');

    if (asset.media_type === 'audio') {
      console.log('🔍 Final audio content item:', {
        id: asset.id,
        title: asset.title,
        partsCount: parts.length,
        parts: parts.map(p => p.substring(0, 50) + '...'),
        combinedTextLength: combinedText.length,
        combinedTextPreview: combinedText.substring(0, 200) + '...'
      });
    }

    return {
      id: asset.id,
      title: asset.title,
      content_type: asset.media_type === 'keyframe_still' ? 'image' : asset.media_type,
      combinedText,
      metadata: {
        s3_url: asset.s3_url,
        cloudflare_url: asset.cloudflare_url,
        media_type: asset.media_type,
      },
    };
  }

  /* ------------- generic retry helper -------------- */
  private async processWithRetry<T>(fn: () => Promise<T>, max = 3, baseDelay = 1000): Promise<T> {
    for (let attempt = 0; attempt < max; attempt++) {
      try { return await fn(); } catch (err) {
        if (attempt === max - 1) throw err;
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⚠️  Retry ${attempt + 1}/${max} after ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error('unreachable');
  }
}
