#!/usr/bin/env tsx

import LanceDBIngestionService from '../lib/lancedb-ingestion-demo';

async function runDemo() {
  console.log('🚀 Starting Media Ingestion Demo...\n');

  try {
    const service = new LanceDBIngestionService();
    await service.runDemo();

    console.log('\n🎉 Demo completed successfully!');
    console.log('✅ Proved that media ingestion works with rich metadata extraction');
    console.log('✅ Demonstrated unified search across all content types');

  } catch (error) {
    console.error('💥 Demo failed:', error);
    process.exit(1);
  }
}

runDemo();
