#!/usr/bin/env tsx

import { ingestAsset } from '@/lib/ingestion';
import { getMediaAsset } from '@/lib/media-storage';

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: tsx scripts/ingest-one-asset.ts <asset-id>');
    process.exit(1);
  }
  console.log(`🔎 Loading asset: ${id}`);
  const asset = await getMediaAsset(id);
  if (!asset) {
    console.error('❌ Asset not found');
    process.exit(2);
  }
  console.log(`📤 Ingesting into LanceDB: ${asset.title} (${asset.media_type})`);
  await ingestAsset(asset, true);
  console.log('✅ Ingested');
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
