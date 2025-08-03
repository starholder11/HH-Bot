#!/usr/bin/env tsx

import './bootstrap-env';
import crypto from 'crypto';

interface VerificationResult {
  localCount: number;
  productionCount: number;
  localHash: string;
  productionHash: string;
  matches: boolean;
  missingIds: string[];
  extraIds: string[];
}

async function getAllIds(serviceUrl: string): Promise<string[]> {
  const dummyVector = new Array(1536).fill(0);

  // Get count first
  const countResponse = await fetch(`${serviceUrl}/count`);
  const { count } = await countResponse.json();

  if (count === 0) return [];

  // Get all records
  const searchResponse = await fetch(`${serviceUrl}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query_embedding: dummyVector,
      limit: count + 100
    })
  });

  const records = await searchResponse.json();
  return records.map((r: any) => r.id).sort();
}

function hashIds(ids: string[]): string {
  const sortedIds = [...ids].sort();
  return crypto.createHash('sha256').update(JSON.stringify(sortedIds)).digest('hex').substring(0, 16);
}

async function verifyTransferIntegrity(): Promise<VerificationResult> {
  console.log('🔍 Verifying transfer integrity...');

  const LOCAL_URL = 'http://localhost:8000';
  const PRODUCTION_URL = process.env.LANCEDB_API_URL || 'http://lancedb-alb-1911503871.us-east-1.elb.amazonaws.com';

  try {
    // Get all IDs from both services
    console.log('📦 Getting IDs from local LanceDB...');
    const localIds = await getAllIds(LOCAL_URL);

    console.log('📦 Getting IDs from production LanceDB...');
    const productionIds = await getAllIds(PRODUCTION_URL);

    // Create sets for comparison
    const localSet = new Set(localIds);
    const productionSet = new Set(productionIds);

    // Find missing and extra IDs
    const missingIds = localIds.filter(id => !productionSet.has(id));
    const extraIds = productionIds.filter(id => !localSet.has(id));

    // Generate hashes
    const localHash = hashIds(localIds);
    const productionHash = hashIds(productionIds);

    const result: VerificationResult = {
      localCount: localIds.length,
      productionCount: productionIds.length,
      localHash,
      productionHash,
      matches: localHash === productionHash,
      missingIds,
      extraIds
    };

    // Report results
    console.log('\\n📊 VERIFICATION RESULTS:');
    console.log(`   • Local count: ${result.localCount}`);
    console.log(`   • Production count: ${result.productionCount}`);
    console.log(`   • Local hash: ${result.localHash}`);
    console.log(`   • Production hash: ${result.productionHash}`);
    console.log(`   • Hashes match: ${result.matches ? '✅ YES' : '❌ NO'}`);

    if (result.missingIds.length > 0) {
      console.log(`   • Missing from production: ${result.missingIds.length} records`);
      if (result.missingIds.length <= 10) {
        console.log(`     IDs: ${result.missingIds.join(', ')}`);
      } else {
        console.log(`     First 10 IDs: ${result.missingIds.slice(0, 10).join(', ')}...`);
      }
    }

    if (result.extraIds.length > 0) {
      console.log(`   • Extra in production: ${result.extraIds.length} records`);
      if (result.extraIds.length <= 10) {
        console.log(`     IDs: ${result.extraIds.join(', ')}`);
      } else {
        console.log(`     First 10 IDs: ${result.extraIds.slice(0, 10).join(', ')}...`);
      }
    }

    if (result.matches) {
      console.log('🎉 VERIFICATION PASSED - All records transferred correctly!');
    } else {
      console.log('⚠️  VERIFICATION FAILED - Discrepancies found');
    }

    return result;

  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  }
}

// Export for use in other scripts
export { verifyTransferIntegrity };

// Run directly if called as script
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyTransferIntegrity()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
