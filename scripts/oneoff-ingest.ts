#!/usr/bin/env tsx

import { ingestAsset } from '@/lib/ingestion';
import { getMediaAsset } from '@/lib/media-storage';

async function run() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: tsx scripts/oneoff-ingest.ts <asset-id>');
    process.exit(1);
  }
  const asset = await getMediaAsset(id);
  if (!asset) {
    console.error('❌ Asset not found:', id);
    process.exit(2);
  }
  console.log('📤 Ingesting:', id, asset.title, `(${asset.media_type})`);
  await ingestAsset(asset, true);
  console.log('✅ Done');
}

run().catch((e) => { console.error('❌ Error:', e?.message || e); process.exit(1); });
