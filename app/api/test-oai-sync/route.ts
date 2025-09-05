import { NextRequest, NextResponse } from 'next/server';
import { uploadS3TextAssetToVectorStore } from '@/lib/openai-sync';
import { getMediaAsset } from '@/lib/media-storage';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint for OAI sync functionality
 * POST /api/test-oai-sync
 */
export async function POST(req: NextRequest) {
  try {
    const { assetId } = await req.json();

    if (!assetId) {
      return NextResponse.json({
        success: false,
        error: 'assetId is required'
      }, { status: 400 });
    }

    console.log(`[test-oai] Testing OAI sync for asset: ${assetId}`);

    // Load the text asset
    const asset = await getMediaAsset(assetId);
    if (!asset) {
      return NextResponse.json({
        success: false,
        error: 'Asset not found'
      }, { status: 404 });
    }

    if (asset.media_type !== 'text') {
      return NextResponse.json({
        success: false,
        error: 'Asset is not a text asset'
      }, { status: 400 });
    }

    console.log(`[test-oai] Found text asset:`, {
      id: asset.id,
      title: asset.title,
      contentLength: (asset as any).content?.length || 0,
      slug: (asset as any).metadata?.slug
    });

    // Test OAI sync
    const result = await uploadS3TextAssetToVectorStore(asset);

    console.log(`[test-oai] OAI sync successful:`, result);

    return NextResponse.json({
      success: true,
      assetId: asset.id,
      vectorStoreFile: {
        id: (result as any)?.id,
        file_id: (result as any)?.file_id
      },
      message: 'OAI sync test completed successfully'
    });

  } catch (error) {
    console.error('[test-oai] OAI sync test failed:', error);
    return NextResponse.json({
      success: false,
      error: 'OAI sync test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    }, { status: 500 });
  }
}

/**
 * Get test instructions
 * GET /api/test-oai-sync
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'OAI Sync Test Endpoint',
    usage: {
      method: 'POST',
      body: {
        assetId: 'uuid-of-text-asset-to-test'
      },
      example: 'curl -X POST http://localhost:3000/api/test-oai-sync -H "Content-Type: application/json" -d \'{"assetId": "7ef7634a-1697-40ab-aafb-c7bd7d46070e"}\''
    }
  });
}
