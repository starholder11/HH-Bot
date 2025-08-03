#!/usr/bin/env tsx

import './bootstrap-env';
import { exportFromLocalLanceDB } from './export-from-local-lancedb';

interface TransferStats {
  totalRecords: number;
  successfulBatches: number;
  failedBatches: number;
  totalBatches: number;
  startTime: number;
  endTime?: number;
}

async function batchTransferToProduction() {
  console.log('🚀 Starting efficient batch transfer to production...');

  const PRODUCTION_URL = process.env.LANCEDB_API_URL || 'http://lancedb-alb-1911503871.us-east-1.elb.amazonaws.com';
  const BATCH_SIZE = 200; // Start with 200 as recommended by senior dev

  const stats: TransferStats = {
    totalRecords: 0,
    successfulBatches: 0,
    failedBatches: 0,
    totalBatches: 0,
    startTime: Date.now()
  };

  try {
    // Step 1: Verify production is accessible
    console.log(`🔗 Checking production LanceDB at ${PRODUCTION_URL}...`);
    const healthResponse = await fetch(`${PRODUCTION_URL}/health`);
    if (!healthResponse.ok) {
      throw new Error(`Production LanceDB not accessible: ${healthResponse.statusText}`);
    }
    console.log('✅ Production LanceDB is accessible');

    // Step 2: Get initial production count
    const initialCountResponse = await fetch(`${PRODUCTION_URL}/count`);
    const { count: initialCount } = await initialCountResponse.json();
    console.log(`📊 Production has ${initialCount} records initially`);

    // Step 3: Export all records from local
    console.log('📦 Exporting records from local LanceDB...');
    const allRecords = await exportFromLocalLanceDB();
    stats.totalRecords = allRecords.length;

    if (allRecords.length === 0) {
      console.log('❌ No records to transfer');
      return;
    }

    // Step 4: Split into batches
    const batches = [];
    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      batches.push(allRecords.slice(i, i + BATCH_SIZE));
    }
    stats.totalBatches = batches.length;

    console.log(`📋 Split ${allRecords.length} records into ${batches.length} batches of ${BATCH_SIZE}`);

    // Step 5: Transfer each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      try {
        console.log(`📤 Transferring batch ${batchNum}/${batches.length} (${batch.length} records)...`);

        // Send batch to production /add endpoint (one record at a time for now)
        // This could be optimized with a /add-batch endpoint later
        for (const record of batch) {
          const addResponse = await fetch(`${PRODUCTION_URL}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
          });

          if (!addResponse.ok) {
            const errorText = await addResponse.text();
            console.error(`❌ Failed to add record ${record.id}: ${addResponse.statusText} - ${errorText}`);
            // Continue with next record rather than failing entire batch
            continue;
          }
        }

        stats.successfulBatches++;
        console.log(`✅ Batch ${batchNum} completed successfully`);

        // Brief pause between batches to avoid overwhelming production
        if (batchNum < batches.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error(`❌ Batch ${batchNum} failed:`, error);
        stats.failedBatches++;
        // Continue with next batch
      }
    }

    // Step 6: Verify final count
    console.log('🔍 Verifying transfer...');
    const finalCountResponse = await fetch(`${PRODUCTION_URL}/count`);
    const { count: finalCount } = await finalCountResponse.json();

    stats.endTime = Date.now();
    const durationMs = stats.endTime - stats.startTime;
    const durationMin = Math.round(durationMs / 1000 / 60 * 10) / 10;

    console.log('\\n🎉 TRANSFER COMPLETE!');
    console.log(`📊 Statistics:`);
    console.log(`   • Total records: ${stats.totalRecords}`);
    console.log(`   • Successful batches: ${stats.successfulBatches}/${stats.totalBatches}`);
    console.log(`   • Failed batches: ${stats.failedBatches}`);
    console.log(`   • Duration: ${durationMin} minutes`);
    console.log(`   • Production count: ${initialCount} → ${finalCount} (+${finalCount - initialCount})`);

    if (finalCount >= initialCount + stats.totalRecords * 0.95) {
      console.log('✅ Transfer verification PASSED (≥95% of records transferred)');
    } else {
      console.log('⚠️  Transfer verification FAILED - some records may be missing');
    }

  } catch (error) {
    console.error('💥 Transfer failed:', error);
    throw error;
  }
}

// Run the transfer
if (import.meta.url === `file://${process.argv[1]}`) {
  batchTransferToProduction()
    .then(() => {
      console.log('🏁 Transfer script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Transfer script failed:', error);
      process.exit(1);
    });
}
