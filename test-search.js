const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "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"
});

const LANCEDB_URL = 'http://localhost:8000';

async function testSearch() {
  try {
    console.log('🔍 Testing search functionality...');

    // Generate embedding for "About"
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'About',
    });

    const embedding = response.data[0].embedding;
    console.log(`Generated embedding length: ${embedding.length}`);

    // Search with the embedding
    const searchResponse = await fetch(`${LANCEDB_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: embedding,
        limit: 5
      }),
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Search failed:', errorText);
      return;
    }

    const results = await searchResponse.json();
    console.log('Search results:', JSON.stringify(results, null, 2));

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testSearch();
