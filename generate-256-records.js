const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "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"
});

const LANCEDB_URL = 'http://localhost:8000';

// Generate embedding using OpenAI
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.trim(),
    });

    const embedding = response.data[0].embedding;

    // Validate embedding dimensions
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      throw new Error(`Invalid embedding dimensions: expected 1536, got ${embedding?.length || 'undefined'}`);
    }

    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    throw error;
  }
}

// Add record to LanceDB
async function addToLanceDB(record) {
  try {
    const response = await fetch(`${LANCEDB_URL}/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LanceDB API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('❌ Failed to add record to LanceDB:', {
      id: record.id,
      error: error.message,
      content_type: record.content_type,
      title: record.title
    });
    throw error;
  }
}

// Generate test records
async function generateTestRecords() {
  console.log('🚀 Generating 256 test records...');

  const records = [];

  // Generate timeline-like records
  for (let i = 1; i <= 128; i++) {
    const title = `Test Timeline Entry ${i}`;
    const content = `This is test timeline content number ${i}. It contains some sample text for testing the vector search functionality. Entry ${i} has various topics and themes for testing purposes.`;
    const combinedText = `${title}\n\n${content}`;

    const embedding = await generateEmbedding(combinedText);

    const record = {
      id: `test-timeline-${i}`,
      content_type: 'text',
      title: title,
      embedding: embedding,
      searchable_text: combinedText,
      content_hash: `test-timeline-${i}`,
      references: JSON.stringify({
        slug: `test-timeline-${i}`,
        date: new Date().toISOString(),
        categories: ['test', 'timeline']
      })
    };

    records.push(record);
    console.log(`✅ Generated timeline record ${i}/128`);
  }

  // Generate media-like records
  for (let i = 1; i <= 128; i++) {
    const title = `Test Media File ${i}`;
    const prompt = `This is a test prompt for media file ${i}`;
    const lyrics = `Test lyrics for media file ${i}. These are sample lyrics for testing purposes.`;
    const analysis = `This is test analysis for media file ${i}. It contains various observations and insights.`;
    const combinedText = `${title}\n\nPrompt: ${prompt}\n\nLyrics: ${lyrics}\n\nAnalysis: ${analysis}`;

    const embedding = await generateEmbedding(combinedText);

    const record = {
      id: `test-media-${i}`,
      content_type: 'media',
      title: title,
      embedding: embedding,
      searchable_text: combinedText,
      content_hash: `test-media-${i}`,
      references: JSON.stringify({
        s3_url: `https://test-bucket.s3.amazonaws.com/test-media-${i}.mp3`,
        cloudflare_url: `https://test-cdn.cloudflare.com/test-media-${i}.mp3`,
        filename: `test-media-${i}.mp3`,
        prompt: prompt,
        auto_analysis: { summary: analysis },
        manual_labels: ['test', 'media']
      })
    };

    records.push(record);
    console.log(`✅ Generated media record ${i}/128`);
  }

  return records;
}

// Main ingestion function
async function ingest256Records() {
  console.log('🚀 Starting 256 record ingestion...');

  try {
    // Generate all records first
    const records = await generateTestRecords();
    console.log(`\n📝 Generated ${records.length} test records`);

    // Ingest all records
    console.log('\n📤 Ingesting records to LanceDB...');
    for (let i = 0; i < records.length; i++) {
      await addToLanceDB(records[i]);
      if ((i + 1) % 10 === 0) {
        console.log(`✅ Ingested ${i + 1}/${records.length} records`);
      }
    }

    console.log('\n✅ Successfully ingested 256 test records!');

    // Check the count
    const countResponse = await fetch(`${LANCEDB_URL}/count`);
    const countData = await countResponse.json();
    console.log(`📊 Total records in LanceDB: ${countData.count}`);

  } catch (error) {
    console.error('❌ 256 record ingestion failed:', error.message);
    throw error;
  }
}

// Run the ingestion
ingest256Records().catch(console.error);
