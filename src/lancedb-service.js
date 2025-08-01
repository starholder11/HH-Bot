const express = require('express');
const lancedb = require('@lancedb/lancedb');
const OpenAI = require('openai');
const arrow = require('apache-arrow');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Replace the early OpenAI instantiation with a lazy getter to avoid crashing when the key is absent
let openai = null;
function getOpenAI() {
  if (openai) return openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.trim() === '') {
    console.warn('⚠️ OPENAI_API_KEY not set – text → embedding search will be disabled. Provide the key to enable full search.');
    return null;
  }
  openai = new OpenAI({ apiKey: key });
  return openai;
}

let db = null;
let table = null;

// Define the vector column type explicitly
const DIM = 1536;

function buildFixedSizeListVector(rowsAsNumberArrays) {
  const type = new arrow.FixedSizeList(DIM, new arrow.Field("item", new arrow.Float32(), false));
  // Arrow API differences between versions – try both Builder.new and makeBuilder
  const builder = (arrow.Builder && arrow.Builder.new)
    ? arrow.Builder.new({ type })
    : arrow.makeBuilder({ type });
  for (const arr of rowsAsNumberArrays) {
    if (!Array.isArray(arr) || arr.length !== DIM) {
      throw new Error(`embedding must be number[${DIM}], got len ${arr?.length}`);
    }
    builder.append(arr);
  }
  return builder.finish().toVector();
}

async function initializeDatabase() {
  try {
    console.log('🚀 Initializing LanceDB...');

    db = await lancedb.connect('/tmp/lancedb');
    console.log('✅ Connected to LanceDB');

    // Check if table already exists
    const TABLE_NAME = 'semantic_search_v5';
    const existingTables = await db.tableNames();

    if (existingTables.includes(TABLE_NAME)) {
      console.log('✅ Using existing table');
      table = await db.openTable(TABLE_NAME);
    } else {
      console.log('🆕 Creating new table with explicit schema');

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
      table = await db.createEmptyTable(TABLE_NAME, schema);
      console.log('✅ Created table with explicit vector schema');
    }

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

    // Validate required non-nullable fields
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: "id is required and must be a non-empty string" });
    }
    if (!content_type || typeof content_type !== 'string') {
      return res.status(400).json({ error: "content_type is required and must be a non-empty string" });
    }

    let embeddingArr;

    if (Array.isArray(embedding)) {
      embeddingArr = embedding;
    } else if (typeof embedding === 'object' && embedding !== null) {
      // Handle the case where Float32Array was JSON-serialized into a struct-like object
      console.log('Received embedding as struct-like object, converting...');

      // Check if this looks like a serialized Float32Array (object with numeric keys)
      const keys = Object.keys(embedding);
      if (keys.length === DIM && keys.every(k => !isNaN(parseInt(k)))) {
        // Convert struct-like object back to plain number[] array
        embeddingArr = Object.keys(embedding)
          .sort((a, b) => parseInt(a) - parseInt(b))  // Sort keys numerically
          .map(key => Number(embedding[key]));        // Convert to numbers
        console.log('✅ Converted struct-like embedding back to number[]');
      } else {
        return res.status(400).json({ error: "Invalid embedding format: object with non-numeric keys" });
      }
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
      last_updated: new Date().toISOString(), // Add the missing field from schema
      references: typeof references === "string" ? references : JSON.stringify(references ?? {})
    };

    // Verify the data format before adding
    if (!Array.isArray(record.embedding) || record.embedding.length !== DIM || typeof record.embedding[0] !== "number") {
      throw new Error(`Invalid embedding format: must be number[${DIM}]`);
    }

    // Build Arrow vectors in the EXACT schema order
    const ids = arrow.Vector.from([id]);
    const ctypes = arrow.Vector.from([content_type]);
    const titles = arrow.Vector.from([title ?? null]);
    const embeds = buildFixedSizeListVector([embeddingArr]);
    const texts = arrow.Vector.from([searchable_text ?? null]);
    const hashes = arrow.Vector.from([content_hash ?? null]);
    const updated = arrow.Vector.from([new Date().toISOString()]);
    const refs = arrow.Vector.from([typeof references === "string" ? references : JSON.stringify(references ?? {})]);

    // Construct RecordBatch with existing table schema
    const schema = await table.schema();
    const batch = arrow.RecordBatch.new(schema, [ids, ctypes, titles, embeds, texts, hashes, updated, refs]);

    if (typeof table.addBatches === 'function') {
      await table.addBatches([batch]);
    } else if (typeof table.addArrow === 'function') {
      await table.addArrow(arrow.Table.new([ids, ctypes, titles, embeds, texts, hashes, updated, refs], schema));
    } else {
      // Fallback – should not happen on recent @lancedb builds
      await table.add([{
        id,
        content_type,
        title: title ?? null,
        embedding: embeddingArr,
        searchable_text: searchable_text ?? null,
        content_hash: content_hash ?? null,
        last_updated: new Date().toISOString(),
        references: typeof references === "string" ? references : JSON.stringify(references ?? {})
      }]);
    }

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
      const openaiInstance = getOpenAI();
      if (!openaiInstance) {
        return res.status(503).json({ error: 'OpenAI API key not configured' });
      }
      const response = await openaiInstance.embeddings.create({
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
        score: result._distance, // Use raw distance for now, lower is better
        searchable_text: result.searchable_text,
        references: JSON.parse(result.references || '{}')
      }))
      .sort((a, b) => a.score - b.score) // Sort by distance (lower is better)
      .slice(0, limit); // Take top results instead of threshold filtering

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

    // Create a dummy vector for scanning purposes
    const dummyVector = new Float32Array(DIM).fill(0.1);

    // Use search with dummy vector to get records
    const results = await table
      .search(dummyVector)
      .limit(limit)
      .toArray();

    const formattedResults = results.map(result => ({
      id: result.id,
      content_type: result.content_type,
      title: result.title,
      searchable_text: result.searchable_text?.substring(0, 100) + '...',
      embedding_length: result.embedding?.length || 0
    }));

    res.json({
      total: 'unknown', // We can't get total without scanning all
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
