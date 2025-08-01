import { NextRequest, NextResponse } from 'next/server';

interface SearchResult {
  id: string;
  content_type: 'video' | 'image' | 'audio' | 'text';
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
      content_types = [],
      filters = {}
    }: {
      query: string;
      limit?: number;
      content_types?: string[];
      filters?: SearchFilters;
    } = await request.json();

    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        error: 'Query parameter is required'
      }, { status: 400 });
    }

    console.log(`🔍 Unified search query: "${query}" with limit: ${limit}`);

    // Embed the query text using OpenAI to get a 1536-dim embedding
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY env var missing' }, { status: 500 });
    }
    const embedResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query.trim()
      })
    });

    if (!embedResponse.ok) {
      const errText = await embedResponse.text();
      return NextResponse.json({ error: 'OpenAI embedding failed', details: errText }, { status: 502 });
    }
    const { data: embedData } = await embedResponse.json();
    const queryEmbedding = embedData[0].embedding;

    // Call the local LanceDB service
    const lancedbUrl = process.env.LANCEDB_URL || 'http://localhost:8000';

    try {
      const searchResponse = await fetch(`${lancedbUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query_embedding: queryEmbedding,
          limit: limit * 2, // Get more results to filter
        }),
      });

      if (!searchResponse.ok) {
        throw new Error(`LanceDB search failed: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();
      const results = Array.isArray(searchData) ? searchData : (searchData.results || []);

      console.log(`📊 Got ${results.length} results from LanceDB`);

      // Process and filter results
      const processedResults: SearchResult[] = results
        .map((result: any) => ({
          id: result.id,
          content_type: result.content_type,
          title: result.title || result.id,
          description: result.searchable_text ? result.searchable_text.substring(0, 200) + '...' : '',
          score: 1 - (result.score || 0), // Convert distance to similarity
          metadata: result.references ? JSON.parse(result.references) : {},
          preview: result.searchable_text ? result.searchable_text.substring(0, 200) + '...' : result.title,
        }))
        .filter((result: SearchResult) => {
          // Filter by content types if specified
          if (content_types.length > 0 && !content_types.includes(result.content_type)) {
            return false;
          }

          // Apply other filters
          return applyFilters(result, filters);
        })
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, limit);

      console.log(`✅ Returning ${processedResults.length} filtered results`);

      // Group results by content type for better UX
      const groupedResults = {
        media: processedResults.filter(r => ['video', 'image', 'audio'].includes(r.content_type)),
        text: processedResults.filter(r => r.content_type === 'text'),
        all: processedResults,
      };

      const responseData = {
        success: true,
        query,
        total_results: processedResults.length,
        results: groupedResults,
        search_time_ms: Date.now(),
      };

      return NextResponse.json(responseData);

    } catch (lancedbError) {
      console.error('LanceDB service error:', lancedbError);

      return NextResponse.json({
        success: false,
        error: 'LanceDB service unavailable',
        details: 'Please ensure the LanceDB service is running on port 8000'
      }, { status: 503 });
    }

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
      content_types: searchParams.get('type') ? [searchParams.get('type')] : [],
      filters: {
        content_type: searchParams.get('content_type') as any,
        media_type: searchParams.get('media_type') as any,
      }
    })
  });

  return POST(postRequest as NextRequest);
}

// Helper function to apply search filters
function applyFilters(result: SearchResult, filters: SearchFilters): boolean {
  // Content type filter
  if (filters.content_type && filters.content_type !== 'all') {
    if (filters.content_type === 'media') {
      // For 'media' filter, accept video, image, audio
      if (!['video', 'image', 'audio'].includes(result.content_type)) {
        return false;
      }
    } else if (result.content_type !== filters.content_type) {
      return false;
    }
  }

  // Media type filter (only applies to media content)
  if (filters.media_type && ['video', 'image', 'audio'].includes(result.content_type)) {
    if (result.content_type !== filters.media_type) {
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
    if (['video', 'image', 'audio'].includes(result.content_type)) {
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
