#!/usr/bin/env tsx
/**
 * Complete LanceDB transfer script with verification and indexing
 * Implements senior dev recommendations for efficient batch transfer
 */

import './bootstrap-env';
import { exportFromLocalLanceDB } from './export-from-local-lancedb';
import { verifyTransferIntegrity } from './verify-transfer-integrity';

async function fullTransferWithVerification() {
  console.log('🚀 Starting FULL LanceDB transfer with verification...');
  console.log('💡 This skips re-embedding and uses existing embeddings for efficiency');

  const PRODUCTION_URL = process.env.LANCEDB_API_URL || 'http://lancedb-alb-1911503871.us-east-1.elb.amazonaws.com';
  const BATCH_SIZE = 200; // As recommended by senior dev

  try {
    // Step 1: Pre-flight checks
    console.log('\\n🔍 STEP 1: Pre-flight checks');
    console.log(`   • Production URL: ${PRODUCTION_URL}`);

    const healthResponse = await fetch(`${PRODUCTION_URL}/health`);
    if (!healthResponse.ok) {
      throw new Error(`Production not accessible: ${healthResponse.statusText}`);
    }
    console.log('   ✅ Production is accessible');

    // Check schema compatibility
    try {
      const schemaResponse = await fetch(`${PRODUCTION_URL}/debug/schema`);
      if (schemaResponse.ok) {
        const schema = await schemaResponse.text();
        console.log('   ✅ Production schema retrieved');
        console.log(`   📋 Schema: ${schema.split('\\n')[0]}...`); // First line only
      }
    } catch (error) {
      console.log('   ⚠️  Could not retrieve schema, proceeding anyway');
    }

    // Step 2: Export from local
    console.log('\\n📦 STEP 2: Export from local LanceDB');
    const allRecords = await exportFromLocalLanceDB();

    if (allRecords.length === 0) {
      console.log('❌ No records found to transfer');
      return;
    }

    // Step 3: Transfer in batches
    console.log(`\\n📤 STEP 3: Batch transfer (${BATCH_SIZE} records per batch)`);
    const startTime = Date.now();

    // Split into batches
    const batches = [];
    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      batches.push(allRecords.slice(i, i + BATCH_SIZE));
    }

    console.log(`   📋 ${allRecords.length} records split into ${batches.length} batches`);

    let successfulRecords = 0;
    let failedRecords = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      console.log(`   📤 Batch ${batchNum}/${batches.length} (${batch.length} records)...`);

      for (const record of batch) {
        try {
          // Verify embedding is present and correct size
          if (!record.embedding || record.embedding.length !== 1536) {
            console.error(`   ❌ Record ${record.id} has invalid embedding`);
            failedRecords++;
            continue;
          }

          const addResponse = await fetch(`${PRODUCTION_URL}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
          });

          if (!addResponse.ok) {
            const errorText = await addResponse.text();
            console.error(`   ❌ Failed to add ${record.id}: ${errorText}`);
            failedRecords++;
          } else {
            successfulRecords++;
          }

        } catch (error) {
          console.error(`   ❌ Error adding ${record.id}:`, error);
          failedRecords++;
        }
      }

      // Progress update
      const progress = Math.round((batchNum / batches.length) * 100);
      console.log(`   ⏳ Progress: ${progress}% (${successfulRecords} success, ${failedRecords} failed)`);

      // Brief pause between batches
      if (batchNum < batches.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    const transferTime = Date.now() - startTime;
    const transferMin = Math.round(transferTime / 1000 / 60 * 10) / 10;

    console.log(`\\n✅ Transfer completed in ${transferMin} minutes`);
    console.log(`   📊 Results: ${successfulRecords} success, ${failedRecords} failed`);

    // Step 4: Verification
    console.log('\\n🔍 STEP 4: Verification');
    const verificationResult = await verifyTransferIntegrity();

    if (!verificationResult.matches) {
      console.log('⚠️  Transfer verification failed - some records may be missing');
      return;
    }

    // Step 5: Build index
    console.log('\\n🏗️  STEP 5: Building production index');
    try {
      const indexResponse = await fetch(`${PRODUCTION_URL}/build-index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (indexResponse.ok) {
        console.log('   ✅ Index build initiated successfully');
      } else {
        console.log(`   ⚠️  Index build failed: ${indexResponse.statusText}`);
        console.log('   💡 You may need to build the index manually later');
      }
    } catch (error) {
      console.log('   ⚠️  Index build request failed (may timeout - this is normal)');
      console.log('   💡 Index may still be building in background');
    }

    // Step 6: Final verification
    console.log('\\n🧪 STEP 6: Search functionality test');
    try {
      const testResponse = await fetch(`${PRODUCTION_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test search',
          limit: 3
        })
      });

      if (testResponse.ok) {
        const results = await testResponse.json();
        console.log(`   ✅ Search test passed (${results.length} results returned)`);
      } else {
        console.log(`   ⚠️  Search test failed: ${testResponse.statusText}`);
      }
    } catch (error) {
      console.log('   ⚠️  Search test error (may be temporary)');
    }

    // Final summary
    const totalTime = Date.now() - startTime;
    const totalMin = Math.round(totalTime / 1000 / 60 * 10) / 10;

    console.log('\\n🎉 FULL TRANSFER COMPLETE!');
    console.log(`📊 Final Summary:`);
    console.log(`   • Records transferred: ${successfulRecords}/${allRecords.length}`);
    console.log(`   • Total time: ${totalMin} minutes`);
    console.log(`   • Verification: ${verificationResult.matches ? 'PASSED' : 'FAILED'}`);
    console.log(`   • Production URL: ${PRODUCTION_URL}`);
    console.log(`\\n💡 Next steps:`);
    console.log(`   • Test search at: ${PRODUCTION_URL.replace('http://', 'http://')}/search`);
    console.log(`   • Monitor index build completion`);
    console.log(`   • Consider implementing persistent storage (EFS) to prevent future data loss`);

  } catch (error) {
    console.error('💥 Transfer failed:', error);
    throw error;
  }
}

// Run the full transfer
if (import.meta.url === `file://${process.argv[1]}`) {
  fullTransferWithVerification()
    .then(() => {
      console.log('🏁 Transfer script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Transfer script failed:', error);
      process.exit(1);
    });
}
