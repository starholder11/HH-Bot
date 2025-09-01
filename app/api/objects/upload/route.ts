import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile } from '@/lib/s3-upload';
import { saveMediaAsset } from '@/lib/media-storage';
import { ObjectAssetZ } from '@/lib/spatial/schemas';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const category = formData.get('category') as string;
    const subcategory = formData.get('subcategory') as string;
    const style = formData.get('style') as string;
    const tags = (formData.get('tags') as string)?.split(',').map(t => t.trim()) || [];
    const projectId = formData.get('projectId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const validExtensions = ['.glb', '.gltf', '.obj', '.fbx'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExtension)) {
      return NextResponse.json({ 
        error: `Invalid file type. Supported: ${validExtensions.join(', ')}` 
      }, { status: 400 });
    }

    // Generate unique ID
    const assetId = uuidv4();
    const now = new Date().toISOString();

    // Upload file to S3
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, key, size, contentType } = await uploadFile(buffer, 'models');

    // Create proper 3D object asset
    const asset = {
      id: assetId,
      filename: file.name,
      s3_url: url, // Use the returned URL
      cloudflare_url: url, // Use the same URL for now
      title: title || file.name.replace(fileExtension, ''),
      description: description || `${title || file.name} 3D model`,
      media_type: 'object' as const,
      metadata: {
        category: category || 'general',
        subcategory: subcategory || 'model',
        style: style || 'default',
        tags: [...tags, '3d', 'model', fileExtension.substring(1)],
        file_size: size, // Use the returned size
        original_filename: file.name
      },
      object_type: 'atomic' as const,
      object: {
        modelUrl: url, // Use the returned URL
        boundingBox: { 
          min: [-0.5, -0.5, -0.5], 
          max: [0.5, 0.5, 0.5] 
        },
        category: category || 'general',
        subcategory: subcategory || 'model',
        style: style || 'default',
        tags: [...tags, '3d', 'model']
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
      project_id: projectId || null,
      created_at: now,
      updated_at: now
    };

    // Validate with schema
    const validatedAsset = ObjectAssetZ.parse(asset);

    // Save to asset system
    await saveMediaAsset(assetId, validatedAsset);

    console.log(`✅ 3D model uploaded: ${assetId} (${file.name})`);

    return NextResponse.json({
      success: true,
      asset: validatedAsset,
      message: `Successfully uploaded "${validatedAsset.title}"`
    });

  } catch (error) {
    console.error('3D model upload error:', error);
    return NextResponse.json(
      { error: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
