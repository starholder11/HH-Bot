import { NextRequest, NextResponse } from 'next/server';
import { searchReusableKeyframes } from '@/lib/media-storage';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const query = searchParams.get('q') || undefined;
    const excludeProjectId = searchParams.get('exclude_project') || undefined;
    const minQuality = searchParams.get('min_quality') ? parseInt(searchParams.get('min_quality')!) : undefined;
    const hasAiLabels = searchParams.get('has_ai_labels') === 'true';
    const minWidth = searchParams.get('min_width') ? parseInt(searchParams.get('min_width')!) : undefined;
    const minHeight = searchParams.get('min_height') ? parseInt(searchParams.get('min_height')!) : undefined;

    // Build filters object
    const filters: any = {};
    if (minQuality !== undefined) filters.minQuality = minQuality;
    if (hasAiLabels) filters.hasAiLabels = true;
    if (minWidth !== undefined || minHeight !== undefined) {
      filters.resolution = {
        minWidth: minWidth || 0,
        minHeight: minHeight || 0
      };
    }

    console.log(`Searching keyframes with query: "${query}", filters:`, filters);

    const keyframes = await searchReusableKeyframes(
      query,
      excludeProjectId,
      Object.keys(filters).length > 0 ? filters : undefined
    );

    return NextResponse.json({
      success: true,
      keyframes,
      count: keyframes.length,
      filters: { query, excludeProjectId, ...filters }
    });

  } catch (error: any) {
    console.error('Error searching keyframes:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to search keyframes',
        details: error.message
      },
      { status: 500 }
    );
  }
}
