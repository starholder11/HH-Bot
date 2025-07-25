import { NextRequest, NextResponse } from 'next/server';
import LanceDBIngestionService from '@/lib/lancedb-ingestion';

interface SearchResult {
  id: string;
  content_type: 'media' | 'text';
  title: string;
  description: string;
  score: number;
  metadata: any;
  url?: string;
  s3_url?: string;
  cloudflare_url?: string;
  preview?: string;
}

interface SearchFilters {
  content_type?: 'media' | 'text' | 'all';
  media_type?: 'image' | 'video' | 'audio';
  date_range?: {
    start: string;
    end: string;
  };
  tags?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const {
      query,
      limit = 20,
      filters = {}
    }: {
      query: string;
      limit?: number;
      filters?: SearchFilters;
    } = await request.json();

    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        error: 'Query parameter is required'
      }, { status: 400 });
    }

    console.log(`🔍 Unified search query: "${query}" with filters:`, filters);

    const ingestionService = new LanceDBIngestionService();

    // Perform semantic search
    const rawResponse = await ingestionService.search(query, limit * 2); // Get more results to filter

    // Extract results array from the response
    const resultsArray = (rawResponse as any)?.results || [];

    // Process and filter results
    const processedResults: SearchResult[] = resultsArray
      .map((result: any) => ({
        id: result.id,
        content_type: result.content_type,
        title: result.title || result.id,
        description: result.description || '',
        score: result.score || 0,
        metadata: result.metadata || {},
        url: result.url,
        s3_url: result.s3_url,
        cloudflare_url: result.cloudflare_url,
        preview: generatePreview(result),
      }))
      .filter((result: SearchResult) => applyFilters(result, filters))
      .slice(0, limit);

    // Group results by content type for better UX
    const groupedResults = {
      media: processedResults.filter(r => r.content_type === 'media'),
      text: processedResults.filter(r => r.content_type === 'text'),
      all: processedResults,
    };

    const responseData = {
      success: true,
      query,
      total_results: processedResults.length,
      filters_applied: filters,
      results: filters.content_type === 'all' || !filters.content_type
        ? groupedResults
        : { [filters.content_type]: groupedResults[filters.content_type] },
      search_time_ms: Date.now(), // You could track actual search time
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Unified search error:', error);

    return NextResponse.json({
      success: false,
      error: 'Search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({
      error: 'Query parameter "q" is required'
    }, { status: 400 });
  }

  // Convert GET to POST format
  const postRequest = new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      limit: parseInt(searchParams.get('limit') || '20'),
      filters: {
        content_type: searchParams.get('type') as any,
        media_type: searchParams.get('media_type') as any,
      }
    })
  });

  return POST(postRequest as NextRequest);
}

// Helper function to generate preview text
function generatePreview(result: any): string {
  if (result.content_type === 'audio' || result.content_type === 'media') {
    const labels = result.metadata?.ai_labels;
    if (labels) {
      const previewParts = [
        labels.scenes?.slice(0, 3).join(', '),
        labels.mood?.slice(0, 2).join(', '),
        labels.themes?.slice(0, 2).join(', ')
      ].filter(Boolean);

      return previewParts.length > 0
        ? `Labels: ${previewParts.join(' • ')}`
        : result.description || 'Audio content';
    }
    return result.description || result.title || 'Media content';
  } else {
    // For text content, return first 200 characters
    const content = result.combined_text || result.description || result.title || '';
    return content.length > 200
      ? content.substring(0, 200) + '...'
      : content;
  }
}

// Helper function to apply search filters
function applyFilters(result: SearchResult, filters: SearchFilters): boolean {
  // Content type filter
  if (filters.content_type && filters.content_type !== 'all') {
    if (result.content_type !== filters.content_type) {
      return false;
    }
  }

  // Media type filter (only applies to media content)
  if (filters.media_type && result.content_type === 'media') {
    if (result.metadata?.media_type !== filters.media_type) {
      return false;
    }
  }

  // Date range filter
  if (filters.date_range) {
    const resultDate = new Date(result.metadata?.created_at || '');
    const startDate = new Date(filters.date_range.start);
    const endDate = new Date(filters.date_range.end);

    if (resultDate < startDate || resultDate > endDate) {
      return false;
    }
  }

  // Tags filter (check if any of the specified tags exist in AI labels)
  if (filters.tags && filters.tags.length > 0) {
    if (result.content_type === 'media') {
      const allLabels = [
        ...(result.metadata?.ai_labels?.scenes || []),
        ...(result.metadata?.ai_labels?.objects || []),
        ...(result.metadata?.ai_labels?.style || []),
        ...(result.metadata?.ai_labels?.mood || []),
        ...(result.metadata?.ai_labels?.themes || []),
      ].map(label => label.toLowerCase());

      const hasMatchingTag = filters.tags.some(tag =>
        allLabels.some(label => label.includes(tag.toLowerCase()))
      );

      if (!hasMatchingTag) {
        return false;
      }
    } else {
      // For text content, check frontmatter tags
      const textTags = result.metadata?.frontmatter?.tags || [];
      const hasMatchingTag = filters.tags.some(tag =>
        textTags.some((textTag: string) =>
          textTag.toLowerCase().includes(tag.toLowerCase())
        )
      );

      if (!hasMatchingTag) {
        return false;
      }
    }
  }

  return true;
}
