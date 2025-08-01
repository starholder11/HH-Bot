import { connect } from '@lancedb/lancedb';
import * as arrow from 'apache-arrow';
import { OpenAI } from 'openai';

const DIM = 1536;
const TABLE_NAME = 'semantic_search';
const DB_PATH = process.env.LANCEDB_PATH || '/tmp/lancedb-data';

export interface TextContent {
  slug: string;
  title: string;
  description?: string;
  content: string;
  frontmatter: any;
  file_path: string;
}

export class LanceDBIngestionService {
  private table: any;
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /** Ensure table connection & schema. Call once before first use */
  private async init() {
    if (this.table) return;
    const db = await connect(DB_PATH);
    try {
      this.table = await db.openTable(TABLE_NAME);
    } catch {
      const VECTOR_TYPE = new arrow.FixedSizeList(
        DIM,
        new arrow.Field('item', new arrow.Float32(), false)
      );
      const schema = new arrow.Schema([
        new arrow.Field('id', new arrow.Utf8(), false),
        new arrow.Field('content_type', new arrow.Utf8(), false),
        new arrow.Field('title', new arrow.Utf8(), true),
        new arrow.Field('embedding', VECTOR_TYPE, false),
        new arrow.Field('searchable_text', new arrow.Utf8(), true),
        new arrow.Field('content_hash', new arrow.Utf8(), true),
        new arrow.Field('references', new arrow.Utf8(), true)
      ]);
      this.table = await db.createEmptyTable(TABLE_NAME, schema);
    }
  }

  /** Generate OpenAI embedding for given text */
  private async generateEmbedding(text: string): Promise<number[]> {
    const resp = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    const vec = resp.data[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== DIM) {
      throw new Error('Invalid embedding length');
    }
    return vec as unknown as number[];
  }

  /** Convert a TextContent item to a DB record (with embedding) */
  async processTextContent(tc: TextContent) {
    await this.init();
    const combined = `${tc.title}\n${tc.description ?? ''}\n${tc.content}`.slice(0, 8192);
    const embedding = await this.generateEmbedding(combined);
    return {
      id: tc.slug,
      content_type: 'text',
      title: tc.title,
      embedding,
      searchable_text: combined,
      content_hash: '',
      references: JSON.stringify(tc.frontmatter ?? {}),
    };
  }

  async addToLanceDB(record: any) {
    await this.init();
    await this.table.add([record]);
  }

  async search(query: string, limit = 5) {
    await this.init();
    const emb = await this.generateEmbedding(query);
    return this.table.search(emb, { metricType: 'cosine' }).limit(limit).toArray();
  }

  async count() {
    await this.init();
    return this.table.countRows();
  }
}
