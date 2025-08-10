import { NextRequest, NextResponse } from 'next/server';
import { uploadImage, uploadFile } from '@/lib/s3-upload';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'image' or 'file'
    const directory = formData.get('directory') as string;

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
    } else {
      // Handle general file upload
      const prefix = directory.replace('public/', '');
      result = await uploadFile(file, prefix);
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      filename: result.key,
      size: result.size,
      contentType: result.contentType
    });

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