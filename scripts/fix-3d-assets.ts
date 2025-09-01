#!/usr/bin/env tsx

import { v4 as uuidv4 } from 'uuid';
import { saveMediaAsset } from '@/lib/media-storage';
import { ObjectAssetZ } from '@/lib/spatial/schemas';

type ObjectSeed = {
  filename: string;
  title: string;
  category: string;
  subcategory: string;
  style?: string;
};

const seeds: ObjectSeed[] = [
  { 
    filename: 'DamagedHelmet.glb', 
    title: 'Damaged Helmet', 
    category: 'props', 
    subcategory: 'helmet',
    style: 'reference'
  },
  { 
    filename: 'BoomBox.glb', 
    title: 'BoomBox', 
    category: 'electronics', 
    subcategory: 'audio',
    style: 'reference'
  },
  { 
    filename: 'Lantern.glb', 
    title: 'Lantern', 
    category: 'lighting', 
    subcategory: 'portable',
    style: 'reference'
  },
  { 
    filename: 'Duck.glb', 
    title: 'Duck', 
    category: 'toys', 
    subcategory: 'animals',
    style: 'reference'
  }
];

async function createProper3DAssets() {
  console.log('🔧 Creating proper 3D model assets with correct structure...');
  
  const now = new Date().toISOString();
  const createdAssets: string[] = [];

  for (const seed of seeds) {
    try {
      // Generate proper UUID instead of fucked-up obj_ prefix
      const id = uuidv4();
      
      // Use proper API route for models
      const modelUrl = `/api/models/reference/threejs/${seed.filename}`;
      
      // Create asset with proper structure and validation
      const asset = {
        id,
        filename: seed.filename,
        s3_url: `local:/models/reference/threejs/${seed.filename}`, // This maps to /api/models/...
        cloudflare_url: '',
        title: seed.title,
        description: `${seed.title} reference model`,
        media_type: 'object' as const,
        metadata: {
          category: seed.category,
          subcategory: seed.subcategory,
          style: seed.style || 'reference',
          tags: ['reference', 'threejs', 'glb']
        },
        object_type: 'atomic' as const,
        object: {
          modelUrl,
          boundingBox: { 
            min: [-0.5, -0.5, -0.5], 
            max: [0.5, 0.5, 0.5] 
          },
          category: seed.category,
          subcategory: seed.subcategory,
          style: seed.style || 'reference',
          tags: ['reference']
        },
        ai_labels: { 
          scenes: [], 
          objects: [], 
          style: [], 
          mood: [], 
          themes: [], 
          confidence_scores: {} 
        },
        manual_labels: { 
          scenes: [], 
          objects: [], 
          style: [], 
          mood: [], 
          themes: [], 
          custom_tags: [] 
        },
        processing_status: { 
          upload: 'completed', 
          metadata_extraction: 'completed', 
          ai_labeling: 'not_started', 
          manual_review: 'pending' 
        },
        timestamps: { 
          uploaded: now, 
          metadata_extracted: now, 
          labeled_ai: null, 
          labeled_reviewed: null 
        },
        labeling_complete: false,
        project_id: null,
        created_at: now,
        updated_at: now
      };

      // Validate the asset with proper schema
      const validatedAsset = ObjectAssetZ.parse(asset);
      
      // Save to proper asset system
      await saveMediaAsset(id, validatedAsset);
      
      createdAssets.push(id);
      console.log(`✅ Created proper asset: ${id} (${seed.title})`);
      
    } catch (error) {
      console.error(`❌ Failed to create asset for ${seed.title}:`, error);
    }
  }

  // Create a proper object collection
  try {
    const collectionId = uuidv4();
    const collection = {
      id: collectionId,
      filename: 'reference_models.json',
      s3_url: 'local:generated',
      cloudflare_url: '',
      title: 'Reference Models Collection',
      description: 'Collection of reference 3D models for testing',
      media_type: 'object_collection' as const,
      metadata: { 
        category: 'reference', 
        style: 'reference', 
        item_count: createdAssets.length 
      },
      collection_type: 'custom' as const,
      collection: {
        name: 'Reference Models',
        description: 'Collection of reference 3D models',
        objects: createdAssets.map((assetId, index) => ({
          id: `ref_${index}`,
          objectId: assetId,
          transform: { 
            position: [index * 2 - 2, 0, 0], 
            rotation: [0, 0, 0], 
            scale: [1, 1, 1] 
          }, 
          role: `reference_${index}`,
          required: true
        })),
        category: 'reference',
        style: 'reference'
      },
      ai_labels: { 
        scenes: [], 
        objects: [], 
        style: [], 
        mood: [], 
        themes: [], 
        confidence_scores: {} 
      },
      manual_labels: { 
        scenes: [], 
        objects: [], 
        style: [], 
        mood: [], 
        themes: [], 
        custom_tags: [] 
      },
      processing_status: { 
        upload: 'completed', 
        metadata_extraction: 'completed', 
        ai_labeling: 'not_started', 
        manual_review: 'pending' 
      },
      timestamps: { 
        uploaded: now, 
        metadata_extracted: now, 
        labeled_ai: null, 
        labeled_reviewed: null 
      },
      labeling_complete: false,
      project_id: null,
      created_at: now,
      updated_at: now
    };

    await saveMediaAsset(collectionId, collection);
    console.log(`✅ Created collection: ${collectionId}`);
    
  } catch (error) {
    console.error('❌ Failed to create collection:', error);
  }

  console.log('\n🎉 Asset creation complete!');
  console.log(`✅ Created ${createdAssets.length} proper 3D model assets`);
  console.log('🔧 These assets now have:');
  console.log('   - Proper UUIDs (not obj_ prefix)');
  console.log('   - Correct model URLs (/api/models/...)');
  console.log('   - Proper validation schemas');
  console.log('   - Correct file path mapping');
}

// Clean up the fucked-up old assets
async function cleanupOldAssets() {
  console.log('\n🧹 Cleaning up old fucked-up assets...');
  
  const oldAssetIds = [
    'obj_Sponza',
    'obj_Duck', 
    'obj_DamagedHelmet',
    'obj_BoomBox',
    'obj_Lantern',
    'objcol_reference_pair'
  ];

  for (const oldId of oldAssetIds) {
    try {
      // Note: We can't actually delete from the file system easily
      // But we can mark them as deprecated or move them
      console.log(`⚠️  Old asset ${oldId} should be removed manually`);
    } catch (error) {
      console.error(`❌ Error handling old asset ${oldId}:`, error);
    }
  }
  
  console.log('💡 To completely clean up:');
  console.log('   1. Delete old asset JSON files from media-sources/assets/');
  console.log('   2. Remove references in any scenes/spaces');
  console.log('   3. Update any hardcoded references to use new UUIDs');
}

async function main() {
  try {
    await createProper3DAssets();
    await cleanupOldAssets();
    
    console.log('\n🚀 Next steps:');
    console.log('   1. Test the new assets in the Spaces editor');
    console.log('   2. Verify 3D models load correctly');
    console.log('   3. Update any hardcoded references to use new asset IDs');
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
