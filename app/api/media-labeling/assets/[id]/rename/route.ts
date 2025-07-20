import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, updateMediaAsset } from '@/lib/media-storage';
import { renameS3Object } from '@/lib/s3-config';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { newFilename } = await request.json();

    if (!newFilename) {
      return NextResponse.json(
        { error: 'New filename is required' },
        { status: 400 }
      );
    }

    // Validate filename (basic validation)
    if (newFilename.includes('/') || newFilename.includes('\\')) {
      return NextResponse.json(
        { error: 'Filename cannot contain path separators' },
        { status: 400 }
      );
    }

    // Get the current asset
    const asset = await getMediaAsset(id);
    if (!asset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Extract the S3 key from the current S3 URL
    const s3UrlParts = asset.s3_url.split('.amazonaws.com/');
    if (s3UrlParts.length !== 2) {
      return NextResponse.json(
        { error: 'Invalid S3 URL format' },
        { status: 400 }
      );
    }

    const currentKey = decodeURIComponent(s3UrlParts[1]);
    console.log('Current S3 key:', currentKey);

    // Rename the S3 object
    const renameResult = await renameS3Object(currentKey, newFilename);

    // Update the asset record with new filename and URLs
    const updatedAsset = await updateMediaAsset(id, {
      filename: newFilename,
      title: newFilename.replace(/\.[^/.]+$/, ''), // Remove extension for title
      s3_url: renameResult.s3_url,
      cloudflare_url: renameResult.cloudflare_url,
    });

    if (!updatedAsset) {
      return NextResponse.json(
        { error: 'Failed to update asset record' },
        { status: 500 }
      );
    }

    console.log(`Successfully renamed ${asset.filename} to ${newFilename}`);

    return NextResponse.json({
      success: true,
      asset: updatedAsset,
      message: `File renamed from "${asset.filename}" to "${newFilename}"`
    });

  } catch (error) {
    console.error('Error renaming file:', error);
    const message = (error as Error)?.message || 'Failed to rename file';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
