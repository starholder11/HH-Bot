import { NextRequest, NextResponse } from 'next/server';
import { uploadImage, uploadFile } from '@/lib/s3-upload';
import { saveMediaAsset } from '@/lib/media-storage';
import { v4 as uuidv4 } from 'uuid';
import { enqueueAnalysisJob } from '@/lib/queue';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'image' or 'file'
    const directory = formData.get('directory') as string;
    const projectId = formData.get('projectId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    let result;

    if (type === 'image') {
      // Handle image upload with processing
      result = await uploadImage(file, {
        quality: 85,
        maxWidth: 1920,
        maxHeight: 1080,
        format: 'jpeg'
      });

      // Create MediaAsset record for images to enable project names in search
      const imageId = uuidv4();
      const now = new Date().toISOString();
      const title = file.name.replace(/\.[^/.]+$/, '');

      const imageData = {
        id: imageId,
        filename: file.name,
        s3_url: result.url, // Use the processed image URL
        cloudflare_url: result.url, // Same as s3_url for now
        title: title,
        media_type: 'image' as const,
        metadata: {
          size: result.size,
          contentType: result.contentType,
          uploadedVia: 'simple-upload'
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
          upload: 'completed' as const,
          metadata_extraction: 'completed' as const,
          ai_labeling: 'pending' as const,
          manual_review: 'pending' as const
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

      // Save image asset
      await saveMediaAsset(imageId, imageData);

      // Auto-enqueue for AI labeling and ingestion
      try {
        await enqueueAnalysisJob({
          assetId: imageId,
          mediaType: 'image',
          title: title,
          s3Url: result.url,
          cloudflareUrl: result.url,
          requestedAt: Date.now(),
          stage: 'post_labeling_ingestion'
        });
        console.log('📤 Enqueued analysis job for uploaded image:', imageId);
      } catch (enqueueErr) {
        console.error('Failed to enqueue analysis job:', enqueueErr);
        // Don't fail the upload if queue fails
      }

      return NextResponse.json({
        success: true,
        url: result.url,
        filename: result.key,
        size: result.size,
        contentType: result.contentType,
        assetId: imageId
      });

    } else {
      // Handle general file upload
      const prefix = directory.replace('public/', '');
      result = await uploadFile(file, prefix);

      return NextResponse.json({
        success: true,
        url: result.url,
        filename: result.key,
        size: result.size,
        contentType: result.contentType
      });
    }

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        error: 'Upload failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
