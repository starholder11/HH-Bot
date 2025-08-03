#!/usr/bin/env tsx

import { ParallelIngestionService, ContentItem } from '../lib/parallel-ingestion';
import './bootstrap-env';

async function testParallelIngestion() {
  console.log('🧪 Testing Parallel Ingestion with Sample Data...');

  const parallelService = new ParallelIngestionService();

  // Create test data
  const testItems: ContentItem[] = [
    {
      id: 'test_parallel_1',
      title: 'Test Parallel Item 1',
      content_type: 'text',
      combinedText: 'This is a test of the parallel ingestion system. It should be much faster than sequential processing.',
      metadata: { test: true }
    },
    {
      id: 'test_parallel_2',
      title: 'Test Parallel Item 2',
      content_type: 'text',
      combinedText: 'Another test item for parallel processing. The system should handle multiple items efficiently.',
      metadata: { test: true }
    },
    {
      id: 'test_parallel_3',
      title: 'Test Parallel Item 3',
      content_type: 'text',
      combinedText: 'Third test item demonstrating batch processing capabilities and performance improvements.',
      metadata: { test: true }
    }
  ];

  try {
    console.log(`🚀 Testing with ${testItems.length} sample items...`);

    const startTime = Date.now();
    await parallelService.ingestWithOptimizations(testItems);
    const duration = Date.now() - startTime;

    console.log(`✅ Test completed in ${duration}ms`);
    console.log(`📊 Performance: ${(testItems.length / (duration / 1000)).toFixed(2)} items/second`);

    // Verify the data was added
    console.log('\n🔍 Verifying ingested data...');
    const response = await fetch('http://localhost:8000/count');
    if (response.ok) {
      const { count } = await response.json();
      console.log(`📊 Total records in database: ${count}`);
    }

    // Test search
    console.log('\n🔍 Testing search on ingested data...');
    const searchResponse = await fetch('http://localhost:8000/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'parallel processing test', limit: 5 })
    });

    if (searchResponse.ok) {
      const results = await searchResponse.json();
      console.log(`✅ Search returned ${results.length} results`);

      if (results.length > 0) {
        console.log('📄 Sample result:', {
          id: results[0].id,
          title: results[0].title,
          similarity: ((2 - results[0]._distance) / 2 * 100).toFixed(1) + '%'
        });
      }
    }

    console.log('\n🎉 Parallel ingestion test completed successfully!');
    console.log('🚀 Ready for full-scale parallel ingestion');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testParallelIngestion().catch(console.error);
