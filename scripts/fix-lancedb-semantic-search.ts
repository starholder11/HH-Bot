#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function fixLanceDBSemanticSearch() {
  console.log('🔧 Fixing LanceDB Semantic Search...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Load all text content
    console.log('\n📄 Step 1: Loading all text content...');
    const textContent = await ingestionService.loadTextContent();
    console.log(`✅ Loaded ${textContent.length} text files`);

    // Step 2: Find almond files specifically
    console.log('\n🥜 Step 2: Finding almond files...');
    const almondFiles = textContent.filter(content =>
      content.slug.includes('almond') ||
      content.content.toLowerCase().includes('almond al')
    );
    console.log(`Found ${almondFiles.length} almond files:`);
    almondFiles.forEach(file => {
      console.log(`   - ${file.slug}`);
    });

    // Step 3: Re-ingest all text content with proper embeddings
    console.log('\n📝 Step 3: Re-ingesting all text content...');
    let successCount = 0;
    let errorCount = 0;

    for (const content of textContent) {
      try {
        console.log(`📝 Processing: ${content.slug}`);

        // Process with cleaned embeddings
        const record = await ingestionService.processTextContent(content);

        // Add to LanceDB (this will overwrite existing record)
        await ingestionService.addToLanceDB(record);

        successCount++;
        console.log(`✅ Added: ${content.slug}`);
      } catch (error) {
        console.error(`❌ Failed to process ${content.slug}:`, error);
        errorCount++;
      }
    }

    console.log(`\n🎉 Re-ingestion complete!`);
    console.log(`✅ Successfully processed: ${successCount} files`);
    console.log(`❌ Errors: ${errorCount} files`);

    // Step 4: Test the fix with almond search
    console.log('\n🧪 Step 4: Testing almond search...');
    console.log('Testing search for "almond al"...');

    const almondResults = await ingestionService.search('almond al', 10);
    console.log('Almond search results:');
    if (Array.isArray(almondResults)) {
      almondResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('Search results:', almondResults);
    }

    // Step 5: Test with a control query
    console.log('\n🧪 Step 5: Testing control query...');
    console.log('Testing search for "hello world"...');

    const helloResults = await ingestionService.search('hello world', 5);
    console.log('Hello World search results:');
    if (Array.isArray(helloResults)) {
      helloResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('Search results:', helloResults);
    }

    // Step 6: Test with a different almond query
    console.log('\n🧪 Step 6: Testing "betty" search...');
    console.log('Testing search for "betty"...');

    const bettyResults = await ingestionService.search('betty', 5);
    console.log('Betty search results:');
    if (Array.isArray(bettyResults)) {
      bettyResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('Search results:', bettyResults);
    }

    // Step 7: Test cosine similarity manually
    console.log('\n📐 Step 7: Testing cosine similarity manually...');
    if (almondFiles.length > 0) {
      const almondContent = almondFiles[0].content;
      const queryEmbedding = await ingestionService.generateEmbedding('almond al');
      const contentEmbedding = await ingestionService.generateEmbedding(almondContent);

      const cosineSimilarity = calculateCosineSimilarity(queryEmbedding, contentEmbedding);
      console.log(`Cosine similarity between "almond al" and almond content: ${cosineSimilarity.toFixed(4)}`);

      // Test with irrelevant content
      const irrelevantEmbedding = await ingestionService.generateEmbedding('hello world');
      const irrelevantSimilarity = calculateCosineSimilarity(queryEmbedding, irrelevantEmbedding);
      console.log(`Cosine similarity between "almond al" and "hello world": ${irrelevantSimilarity.toFixed(4)}`);
    }

  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (norm1 * norm2);
}

fixLanceDBSemanticSearch();
