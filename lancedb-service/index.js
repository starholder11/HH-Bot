// Minimal LanceDB service scaffold with explicit vector schema (CommonJS)
const express = require('express');
const bodyParser = require('body-parser');
const { connect } = require('@lancedb/lancedb');
const arrow = require('apache-arrow');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.LANCEDB_PATH || '/tmp/lancedb-data';
const TABLE_NAME = 'semantic_search';
const DIM = 1536;

async function initLanceDB() {
  console.log('🚀 Initializing LanceDB...');
  const db = await connect(DB_PATH);
  let table;
  try {
    table = await db.openTable(TABLE_NAME);
    console.log('✅ Opened existing table');
  } catch {
    console.log('ℹ️ Table not found – creating new table with explicit schema');
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
    table = await db.createEmptyTable(TABLE_NAME, schema);
    console.log('✅ Table created');
  }

  // Test simple query to ensure connection
  await table.countRows();
  console.log('✅ Connected to LanceDB');
  return table;
}

function normalizeEmbedding(inp) {
  if (Array.isArray(inp)) return inp;
  if (typeof inp === 'object' && inp !== null) {
    const keys = Object.keys(inp).sort((a, b) => Number(a) - Number(b));
    return keys.map((k) => inp[k]);
  }
  return null;
}

(async () => {
  const table = await initLanceDB();

  const app = express();
  app.use(bodyParser.json({ limit: '10mb' }));

  app.get('/health', (_, res) => res.send('OK'));

  app.get('/count', async (_, res) => {
    const count = await table.countRows();
    res.json({ count });
  });

  app.get('/debug/schema', async (_, res) => {
    const schema = await table.schema();
    res.type('text/plain').send(schema.toString());
  });

  app.post('/add', async (req, res) => {
    try {
      const record = req.body;
      const emb = normalizeEmbedding(record.embedding);
      if (!emb || emb.length !== DIM) {
        return res.status(400).json({ error: `embedding must be number[${DIM}]` });
      }
      // Build a clean object that matches the table schema exactly
      const clean = {
        id: record.id,
        content_type: record.content_type,
        title: record.title,
        embedding: emb.map(Number), // plain number[] so Arrow maps to FixedSizeList
        searchable_text: record.searchable_text,
        content_hash: record.content_hash ?? null,
        references: record.references ?? null,
      };
      await table.add([clean]);
      res.json({ status: 'ok' });
    } catch (error) {
      console.error('❌ /add failed', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/search', async (req, res) => {
    try {
      const { query_embedding, limit = 5 } = req.body;
      const emb = normalizeEmbedding(query_embedding).map(Number);
      if (!emb || emb.length !== DIM) {
        return res.status(400).json({ error: `query_embedding must be number[${DIM}]` });
      }
      const results = await table
        .search(emb, { metricType: 'cosine' })
        .limit(limit)
        .toArray();
      res.json(results);
    } catch (error) {
      console.error('❌ /search failed', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/build-index', async (_, res) => {
    try {
      await table.createIndex('embedding', {
        type: 'IVF_FLAT',
        num_partitions: 1, // brute-force within single list
        // num_sub_vectors not used for FLAT
        metric_type: 'cosine',
        replace: true
      });
      res.json({ status: 'index_built' });
    } catch (error) {
      console.error('❌ /build-index failed', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete all text rows (ids starting with "text_" or content_type = 'text') before re-ingestion
  app.post('/delete-text', async (_, res) => {
    try {
      const deletedCount = await table.delete("content_type = 'text'");
      console.log(`🗑️  Deleted ${deletedCount} text rows`);
      res.json({ status: 'text_rows_deleted', deleted: deletedCount });
    } catch (error) {
      console.error('❌ /delete-text failed', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 LanceDB service running on port ${PORT}`);
  });
})();
