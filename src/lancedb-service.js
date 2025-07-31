const express = require('express');
const lancedb = require('@lancedb/lancedb');
const OpenAI = require('openai');
const arrow = require('apache-arrow');

const app = express();
app.use(express.json({ limit: '50mb' }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let db = null;
let table = null;

// Define the vector column type explicitly
const DIM = 1536;

async function initializeDatabase() {
  try {
    console.log('🚀 Initializing LanceDB...');

    db = await lancedb.connect('/tmp/lancedb');
    console.log('✅ Connected to LanceDB');

        // Drop existing tables
    try {
      await db.dropTable('semantic_search');
      console.log('🗑️ Dropped existing table');
    } catch (error) {
      console.log('ℹ️ No existing table to drop');
    }

    // Also try dropping with different names to ensure clean slate
    try {
      await db.dropTable('semantic_search_v2');
      console.log('🗑️ Dropped backup table');
    } catch (error) {
      // Ignore
    }

    try {
      await db.dropTable('semantic_search_v3');
      console.log('🗑️ Dropped v3 table');
    } catch (error) {
      // Ignore
    }

    try {
      await db.dropTable('semantic_search_v4');
      console.log('🗑️ Dropped v4 table');
    } catch (error) {
      // Ignore
    }

    try {
      await db.dropTable('semantic_search_v5');
      console.log('🗑️ Dropped v5 table');
    } catch (error) {
      // Ignore
    }

    // Define schema explicitly with FixedSizeList(1536, Float32)
    const schema = new arrow.Schema([
      new arrow.Field("id", new arrow.Utf8(), false),
      new arrow.Field("content_type", new arrow.Utf8(), false),
      new arrow.Field("title", new arrow.Utf8(), true),
      new arrow.Field("embedding", new arrow.FixedSizeList(DIM, new arrow.Field("item", new arrow.Float32(), false)), false),
      new arrow.Field("searchable_text", new arrow.Utf8(), true),
      new arrow.Field("content_hash", new arrow.Utf8(), true),
      new arrow.Field("last_updated", new arrow.Utf8(), true),
      new arrow.Field("references", new arrow.Utf8(), true)
    ]);

                // Create empty table with explicit schema
    table = await db.createEmptyTable('semantic_search_v5', schema);
    console.log('✅ Created table with explicit vector schema');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  if (table) {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({ status: 'initializing' });
  }
});

// Debug endpoint to check schema
app.get('/debug/schema', async (req, res) => {
  try {
    const schema = await table.schema();
    res.type("text/plain").send(schema.toString());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add record endpoint with support for both embedding and embedding_b64
app.post('/add', async (req, res) => {
  try {
    const { id, content_type, title, embedding, embedding_b64, searchable_text, content_hash, references } = req.body;
    let embeddingArr;

    if (Array.isArray(embedding)) {
      embeddingArr = embedding;
    } else if (typeof embedding_b64 === "string") {
      const buf = Buffer.from(embedding_b64, "base64");
      if (buf.byteLength !== DIM * 4) {
        return res.status(400).json({ error: `embedding_b64 must decode to ${DIM * 4} bytes` });
      }
      embeddingArr = Array.from(new Float32Array(buf.buffer, buf.byteOffset, DIM));
    } else {
      return res.status(400).json({ error: "embedding must be a number[] or embedding_b64 must be a base64 string" });
    }

    if (embeddingArr.length !== DIM) throw new Error(`bad dim ${embeddingArr.length}`);

    // Use the working approach: plain objects with number[] for embedding
    const record = {
      id,
      content_type,
      title: title ?? null,
      embedding: embeddingArr, // Plain number[] - LanceDB will respect the schema
      searchable_text: searchable_text ?? null,
      content_hash: content_hash ?? null,
      references: typeof references === "string" ? references : JSON.stringify(references ?? {})
    };

    // Verify the data format before adding
    if (!Array.isArray(record.embedding) || record.embedding.length !== DIM || typeof record.embedding[0] !== "number") {
      throw new Error(`Invalid embedding format: must be number[${DIM}]`);
    }

    await table.add([record]);
    console.log(`✅ Added record: ${id}`);

    res.json({ success: true, id });
  } catch (error) {
    console.error('❌ Add record failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search endpoint with base64 support
app.post('/search', async (req, res) => {
  try {
    const { query, query_embedding, query_embedding_b64, limit = 10, threshold = 0.3 } = req.body;

    let searchEmbedding;

    if (query_embedding_b64) {
      // Use provided base64 embedding
      if (typeof query_embedding_b64 !== "string") {
        return res.status(400).json({ error: "query_embedding_b64 must be a base64 string" });
      }

      const buf = Buffer.from(query_embedding_b64, "base64");
      if (buf.byteLength !== DIM * 4) {
        return res.status(400).json({ error: `query_embedding_b64 must decode to ${DIM * 4} bytes` });
      }

      searchEmbedding = new Float32Array(buf.buffer, buf.byteOffset, DIM);
    } else if (query_embedding) {
      // Use provided array embedding (legacy support)
      if (!Array.isArray(query_embedding) || query_embedding.length !== DIM) {
        return res.status(400).json({ error: `query_embedding must be length ${DIM}` });
      }
      searchEmbedding = Float32Array.from(query_embedding);
    } else if (query) {
      // Generate embedding from text
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      });
      searchEmbedding = Float32Array.from(response.data[0].embedding);
    } else {
      return res.status(400).json({ error: 'Either query, query_embedding, or query_embedding_b64 required' });
    }

    // Vector search with the embedding
    const results = await table
      .search(searchEmbedding, { metricType: 'cosine' })
      .limit(limit)
      .toArray();

    // Format results
    const formattedResults = results
      .map(result => ({
        id: result.id,
        content_type: result.content_type,
        title: result.title,
        score: 1 - (result._distance || 0), // Convert distance to similarity
        searchable_text: result.searchable_text,
        references: JSON.parse(result.references || '{}')
      }))
      .filter(result => result.score >= threshold);

    console.log(`🔍 Search for "${query || 'embedding'}": ${formattedResults.length} results`);

    res.json({ results: formattedResults });

  } catch (error) {
    console.error('❌ Search failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create index endpoint
app.post('/create-index', async (req, res) => {
  try {
    const { type = 'IVF_PQ', num_partitions = 256, num_sub_vectors = 64, metric_type = 'cosine' } = req.body;

    await table.createIndex('embedding', {
      type: type,
      num_partitions: num_partitions,
      num_sub_vectors: num_sub_vectors,
      metric_type: metric_type
    });

    console.log('✅ Created vector index');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Create index failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Count records endpoint
app.get('/count', async (req, res) => {
  try {
    const count = await table.countRows();
    res.json({ count });
  } catch (error) {
    console.error('❌ Count failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Scan records endpoint for debugging
app.get('/scan', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const results = await table.toArrow();
    const limitedResults = results.slice(0, limit);

    const formattedResults = limitedResults.map(result => ({
      id: result.id,
      content_type: result.content_type,
      title: result.title,
      searchable_text: result.searchable_text?.substring(0, 100) + '...',
      embedding_length: result.embedding?.length || 0
    }));

    res.json({
      total: results.length,
      shown: formattedResults.length,
      results: formattedResults
    });
  } catch (error) {
    console.error('❌ Scan failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Build index endpoint (alias for create-index)
app.post('/build-index', async (req, res) => {
  try {
    const { column = 'embedding', metric = 'cosine', num_partitions = 256, replace = true } = req.body;

    await table.createIndex(column, {
      type: 'IVF_PQ',
      num_partitions: num_partitions,
      num_sub_vectors: 64,
      metric_type: metric,
      replace: replace
    });

    console.log(`✅ Built vector index on column: ${column}`);
    res.json({ success: true, column, metric, num_partitions });
  } catch (error) {
    console.error('❌ Build index failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug index endpoint
app.get('/debug/index', async (req, res) => {
  try {
    const indices = await table.listIndices();
    res.json({ indices });
  } catch (error) {
    console.error('❌ Debug index failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize and start server
async function startServer() {
  try {
    await initializeDatabase();

    const port = process.env.PORT || 8000;
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 LanceDB service running on port ${port}`);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 Shutting down gracefully...');
  process.exit(0);
});

startServer();
