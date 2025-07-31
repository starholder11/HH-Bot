const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { OpenAI } = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-proj-1234567890abcdef"
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
    console.log(`✅ Successfully added record: ${record.id}`);
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

// Process timeline entry
async function processTimelineEntry(slug, content, metadata) {
  const combinedText = `${metadata.title}\n\n${content}`;
  const embedding = await generateEmbedding(combinedText);

  const record = {
    id: `timeline-${slug}`,
    content_type: 'text',
    title: metadata.title,
    embedding: embedding,
    searchable_text: combinedText,
    content_hash: `timeline-${slug}`,
    references: JSON.stringify({
      slug: slug,
      date: metadata.date,
      categories: metadata.categories || []
    })
  };

  return record;
}

// Process audio file
async function processAudioFile(audioData) {
  const combinedText = `${audioData.title}\n\nPrompt: ${audioData.prompt}\n\nLyrics: ${audioData.lyrics}\n\nAnalysis: ${JSON.stringify(audioData.auto_analysis)}`;
  const embedding = await generateEmbedding(combinedText);

  const record = {
    id: `audio-${audioData.id}`,
    content_type: 'media',
    title: audioData.title,
    embedding: embedding,
    searchable_text: combinedText,
    content_hash: `audio-${audioData.id}`,
    references: JSON.stringify({
      s3_url: audioData.s3_url,
      cloudflare_url: audioData.cloudflare_url,
      filename: audioData.filename,
      prompt: audioData.prompt,
      auto_analysis: audioData.auto_analysis,
      manual_labels: audioData.manual_labels
    })
  };

  return record;
}

// Main ingestion function
async function testIngestion() {
  console.log('🚀 Starting test ingestion...');

  try {
    // Test with one timeline entry
    console.log('\n📝 Processing timeline entry...');
    const timelinePath = path.join(__dirname, 'content/timeline/about/content.mdx');
    const timelineYamlPath = path.join(__dirname, 'content/timeline/about/index.yaml');

    if (fs.existsSync(timelinePath) && fs.existsSync(timelineYamlPath)) {
      const content = fs.readFileSync(timelinePath, 'utf8');
      const metadata = yaml.load(fs.readFileSync(timelineYamlPath, 'utf8'));

      const timelineRecord = await processTimelineEntry('about', content, metadata);
      await addToLanceDB(timelineRecord);
    }

    // Test with one audio file
    console.log('\n🎵 Processing audio file...');
    const audioDataPath = path.join(__dirname, 'audio-sources/data/fb7c1da5-926f-43b3-98c1-644f3574d1a7.json');

    if (fs.existsSync(audioDataPath)) {
      const audioData = JSON.parse(fs.readFileSync(audioDataPath, 'utf8'));
      const audioRecord = await processAudioFile(audioData);
      await addToLanceDB(audioRecord);
    }

    console.log('\n✅ Test ingestion completed successfully!');

    // Check the count
    const countResponse = await fetch(`${LANCEDB_URL}/count`);
    const countData = await countResponse.json();
    console.log(`📊 Total records in LanceDB: ${countData.count}`);

  } catch (error) {
    console.error('❌ Test ingestion failed:', error.message);
    throw error;
  }
}

// Run the test
testIngestion().catch(console.error);
