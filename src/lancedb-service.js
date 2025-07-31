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

    // Drop existing table
    try {
      await db.dropTable('semantic_search');
      console.log('🗑️ Dropped existing table');
    } catch (error) {
      console.log('ℹ️ No existing table to drop');
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
    table = await db.createEmptyTable('semantic_search', schema);
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

// Add record endpoint with PROPER vector handling
app.post('/add', async (req, res) => {
  try {
    const { id, content_type, title, embedding, searchable_text, content_hash, references } = req.body;

    // Validate embedding
    if (!Array.isArray(embedding) && !(embedding instanceof Float32Array)) {
      return res.status(400).json({ error: "embedding must be an array" });
    }
    if (embedding.length !== DIM) {
      return res.status(400).json({ error: `embedding must be length ${DIM}` });
    }

        // Create Float32Array for the embedding
    const vec = embedding instanceof Float32Array
      ? embedding
      : Float32Array.from(embedding); // ensures Float32, not Float64

    // Try using LanceDB's vector helper
    const record = {
      id,
      content_type,
      title,
      embedding: vec, // Float32Array for proper vector storage
      searchable_text,
      content_hash,
      last_updated: new Date().toISOString(),
      references: typeof references === "string" ? references : JSON.stringify(references ?? {})
    };

    // Try using LanceDB's native vector support with explicit vector column
    await table.add([record], { vectorColumn: 'embedding' });
    console.log(`✅ Added record: ${id}`);

    res.json({ success: true, id });
  } catch (error) {
    console.error('❌ Add record failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search endpoint with PROPER vector search
app.post('/search', async (req, res) => {
  try {
    const { query, query_embedding, limit = 10, threshold = 0.3 } = req.body;

    let searchEmbedding;

    if (query_embedding) {
      // Use provided embedding
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
      return res.status(400).json({ error: 'Either query or query_embedding required' });
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
