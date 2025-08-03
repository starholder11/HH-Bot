#!/usr/bin/env tsx

import './bootstrap-env';

interface LanceDBRecord {
  id: string;
  content_type: string;
  title: string;
  embedding: number[];
  searchable_text: string;
  content_hash: string | null;
  references: string | null;
}

async function exportFromLocalLanceDB(): Promise<LanceDBRecord[]> {
  console.log('🚀 Exporting all records from local LanceDB...');

  const LOCAL_LANCEDB_URL = 'http://localhost:8000';

  try {
    // First check how many records we have
    const countResponse = await fetch(`${LOCAL_LANCEDB_URL}/count`);
    if (!countResponse.ok) {
      throw new Error(`Failed to get count: ${countResponse.statusText}`);
    }

    const { count } = await countResponse.json();
    console.log(`📊 Found ${count} records to export`);

    if (count === 0) {
      console.log('❌ No records found in local LanceDB');
      return [];
    }

    // Use a large search to get ALL records
    // We'll search with a dummy vector and use a huge limit
    const dummyVector = new Array(1536).fill(0);

    const searchResponse = await fetch(`${LOCAL_LANCEDB_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query_embedding: dummyVector,
        limit: Math.max(count * 2, 10000) // Ensure we get ALL records
      })
    });

    if (!searchResponse.ok) {
      throw new Error(`Failed to export records: ${searchResponse.statusText}`);
    }

    const records = await searchResponse.json() as any[];
    console.log(`✅ Exported ${records.length} records from local LanceDB`);

    // Transform the records to match our expected format
    const cleanRecords: LanceDBRecord[] = records.map(record => ({
      id: record.id,
      content_type: record.content_type,
      title: record.title,
      embedding: record.embedding,
      searchable_text: record.searchable_text,
      content_hash: record.content_hash,
      references: record.references
    }));

    // Verify we have embeddings
    const recordsWithEmbeddings = cleanRecords.filter(r => r.embedding && r.embedding.length === 1536);
    console.log(`🔍 Records with valid embeddings: ${recordsWithEmbeddings.length}/${cleanRecords.length}`);

    if (recordsWithEmbeddings.length !== cleanRecords.length) {
      console.warn(`⚠️  ${cleanRecords.length - recordsWithEmbeddings.length} records missing embeddings!`);
    }

    return cleanRecords;

  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  }
}

// Export function for use in other scripts
export { exportFromLocalLanceDB };

// Run directly if called as script
if (import.meta.url === `file://${process.argv[1]}`) {
  exportFromLocalLanceDB()
    .then(records => {
      console.log(`🎉 Export complete: ${records.length} records ready for transfer`);
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Export failed:', error);
      process.exit(1);
    });
}
