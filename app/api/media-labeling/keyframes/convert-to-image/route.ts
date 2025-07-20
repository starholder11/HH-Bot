import { NextRequest, NextResponse } from 'next/server';
import { convertKeyframeToImageAsset } from '@/lib/media-storage';

export async function POST(request: NextRequest) {
  try {
    const { keyframeId, targetProjectId, newTitle } = await request.json();

    if (!keyframeId || !targetProjectId) {
      return NextResponse.json(
        { error: 'keyframeId and targetProjectId are required' },
        { status: 400 }
      );
    }

    console.log(`Converting keyframe ${keyframeId} to image asset for project ${targetProjectId}`);

    // Convert the keyframe to a standalone image asset
    const newImageAsset = await convertKeyframeToImageAsset(
      keyframeId,
      targetProjectId,
      newTitle
    );

    return NextResponse.json({
      success: true,
      imageAsset: newImageAsset,
      message: `Keyframe converted to image asset: ${newImageAsset.title}`
    });

  } catch (error: any) {
    console.error('Error converting keyframe to image:', error);

    return NextResponse.json(
      {
        error: 'Failed to convert keyframe to image asset',
        details: error.message
      },
      { status: 500 }
    );
  }
}
