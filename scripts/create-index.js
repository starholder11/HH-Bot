#!/usr/bin/env node

const LanceDBManager = require('../lancedb-service/lib/lancedb-manager');

async function createIndex() {
  console.log('🔍 Creating vector index...');

  try {
    const lanceDB = new LanceDBManager('/tmp/lancedb');
    await lanceDB.initialize();

    console.log('✅ LanceDB initialized');

    const success = await lanceDB.createVectorIndex();

    if (success) {
      console.log('✅ Vector index created successfully');
    } else {
      console.log('❌ Failed to create vector index');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createIndex();
