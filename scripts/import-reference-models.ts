import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { saveMediaAsset } from '@/lib/media-storage';

type ObjectSeed = {
  filename: string;
  title: string;
  category: string;
  subcategory: string;
};

const seeds: ObjectSeed[] = [
  { filename: 'DamagedHelmet.glb', title: 'Damaged Helmet', category: 'props', subcategory: 'helmet' },
  { filename: 'BoomBox.glb', title: 'BoomBox', category: 'electronics', subcategory: 'audio' },
  { filename: 'Lantern.glb', title: 'Lantern', category: 'lighting', subcategory: 'portable' },
  { filename: 'Duck.glb', title: 'Duck', category: 'toys', subcategory: 'animals' },
  { filename: 'Sponza.glb', title: 'Sponza', category: 'architectural', subcategory: 'scene' }
];

async function run() {
  const now = new Date().toISOString();
  for (const seed of seeds) {
    const id = `obj_${seed.filename.replace(/\.glb$/i, '')}`;
    const modelUrl = `/models/reference/threejs/${seed.filename}`;

    const asset: any = {
      id,
      filename: seed.filename,
      s3_url: `local:${modelUrl}`,
      cloudflare_url: '',
      title: seed.title,
      description: `${seed.title} reference model`,
      media_type: 'object',
      metadata: {
        category: seed.category,
        subcategory: seed.subcategory,
        style: 'reference',
        tags: ['reference', 'threejs', 'glb']
      },
      object_type: 'atomic',
      object: {
        modelUrl,
        boundingBox: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
        category: seed.category,
        subcategory: seed.subcategory,
        style: 'reference',
        tags: ['reference']
      },
      ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
      manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
      processing_status: { upload: 'completed', metadata_extraction: 'completed', ai_labeling: 'not_started', manual_review: 'pending' },
      timestamps: { uploaded: now, metadata_extracted: now, labeled_ai: null, labeled_reviewed: null },
      labeling_complete: false,
      project_id: null,
      created_at: now,
      updated_at: now
    };

    await saveMediaAsset(id, asset);
    console.log(`Imported object asset: ${id} (${seed.title})`);
  }

  // Create a small collection with two items
  const colId = 'objcol_reference_pair';
  const collection: any = {
    id: colId,
    filename: 'reference_pair.json',
    s3_url: 'local:generated',
    cloudflare_url: '',
    title: 'Reference Pair',
    media_type: 'object_collection',
    metadata: { category: 'reference', style: 'reference', item_count: 2 },
    collection_type: 'custom',
    collection: {
      name: 'Reference Pair',
      description: 'Pair of reference objects for testing',
      objects: [
        { id: 'a', objectId: 'obj_DamagedHelmet', transform: { position: [-1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, role: 'left' },
        { id: 'b', objectId: 'obj_BoomBox', transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, role: 'right' }
      ],
      category: 'reference',
      style: 'reference'
    },
    ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
    manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
    processing_status: { upload: 'completed', metadata_extraction: 'completed', ai_labeling: 'not_started', manual_review: 'pending' },
    timestamps: { uploaded: now, metadata_extracted: now, labeled_ai: null, labeled_reviewed: null },
    labeling_complete: false,
    project_id: null,
    created_at: now,
    updated_at: now
  };
  await saveMediaAsset(colId, collection);
  console.log(`Imported collection: ${colId}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});


