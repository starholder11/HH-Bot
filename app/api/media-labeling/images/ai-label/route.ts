import { NextRequest, NextResponse } from 'next/server';
import { performAiLabeling } from '@/lib/ai-labeling';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { assetId, force = false } = body;

    if (!assetId) {
      return NextResponse.json(
        { error: 'Asset ID is required' },
        { status: 400 }
      );
    }

    console.log(`[ai-label] Processing asset: ${assetId} (force: ${force})`);

    // Use the shared AI labeling function
    const result = await performAiLabeling(assetId, force);

    return NextResponse.json(result);

  } catch (error) {
    console.error('AI labeling API error:', error);

    if (error instanceof Error) {
      if (error.message === 'Asset not found') {
        return NextResponse.json(
          { error: 'Asset not found' },
          { status: 404 }
        );
      }

      if (error.message === 'Asset is not an image') {
        return NextResponse.json(
          { error: 'Asset is not an image' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'AI labeling failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}


