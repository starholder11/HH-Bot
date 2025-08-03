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
  searchable_text?: string;
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

    const queryTokens = query.toLowerCase().split(/\s+/).filter(tok => tok.length > 2);

    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        error: 'Query parameter is required'
      }, { status: 400 });
    }

    console.log(`🔍 Unified search query: "${query}" with limit: ${limit}`);

    // Embed the query text using OpenAI to get a 1536-dim embedding
    const openaiApiKey = process.env.OPENAI_API_KEY;
    console.log('🔑 OpenAI API Key present:', !!openaiApiKey, openaiApiKey ? `${openaiApiKey.slice(0, 10)}...` : 'null');
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
      console.log('❌ OpenAI API Error:', embedResponse.status, errText);
      return NextResponse.json({ error: 'OpenAI embedding failed', details: errText }, { status: 502 });
    }
    console.log('✅ OpenAI API Success:', embedResponse.status);
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
          limit: Math.max(limit * 50, 500), // Fetch enough chunks to aggregate top-3 per doc
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
          content_type: (() => {
            if (result.content_type !== 'media') return result.content_type;
            // Heuristically derive subtype from refs URLs
            try {
              const refs = result.references ? JSON.parse(result.references) : {};
              const url: string = refs.s3_url || refs.cloudflare_url || '';
              if (/\/audio\//.test(url) || /\.mp3$/i.test(url)) return 'audio';
              if (/\/video\//.test(url) || /\.mp4$/i.test(url)) return 'video';
              if (/\/image\//.test(url) || /\.(png|jpg|jpeg)$/i.test(url)) return 'image';
            } catch { /* fallthrough */ }
            return 'video';
          })(),
          title: result.title || result.id,
          description: result.searchable_text ? result.searchable_text.substring(0, 200) + '...' : '',
          score: (() => {
            let d = typeof result._distance === 'number' ? result._distance : (typeof result.score === 'number' ? result.score : NaN);
            if (!Number.isFinite(d)) d = 2; // treat missing distance as worst match
            const sim = 1 - Math.min(Math.max(d, 0), 2) / 2;
            return sim; // 0..1 similarity
          })(),
          metadata: result.references ? JSON.parse(result.references) : {},
          preview: result.searchable_text ? result.searchable_text.substring(0, 200) + '...' : result.title,
        }))
        .filter((result: SearchResult) => {
          // Filter by content types if specified
          if (content_types.length > 0) {
            // Treat "media" as shorthand for video,image,audio and alias keyframe stills
            const mediaTypes = ['video', 'image', 'audio'];
            let ctype = result.content_type;
            try {
              const url = (result.metadata?.s3_url || result.metadata?.cloudflare_url || '').toString();
              if (ctype === 'video' && /\.(png|jpg|jpeg)$/i.test(url)) {
                ctype = 'image';
              }
            } catch {/* ignore */}
            const matches = content_types.includes(ctype) ||
              (content_types.includes('media') && mediaTypes.includes(ctype));
            if (!matches) return false;
          }

          // Apply other filters
          return applyFilters(result, filters);
        })
        .sort((a: any, b: any) => b.score - a.score);

      console.log(`✅ Returning ${processedResults.length} filtered results`);

      // --- Aggregate top-3 chunk similarity per document ---
      const mediaResults: SearchResult[] = [];
      const docMap = new Map<string, { rep: SearchResult; scores: number[] }>();

      for (const res of processedResults) {
        if (['video', 'image', 'audio'].includes(res.content_type)) {
          mediaResults.push(res);
          continue;
        }
        // text chunk
        const parent = res.id.split('#')[0];
        let entry = docMap.get(parent);
        if (!entry) {
          entry = { rep: res, scores: [] };
          docMap.set(parent, entry);
        }
        entry.scores.push(res.score);
        if (res.score > entry.rep.score) {
          entry.rep = res;
        }
      }

      const textResults: SearchResult[] = Array.from(docMap.values()).map(({ rep, scores }) => {
        const top3 = scores.sort((a, b) => b - a).slice(0, 3);
        const avg = top3.reduce((a, b) => a + b, 0) / top3.length;
        return { ...rep, score: avg };
      }).sort((a, b) => b.score - a.score);

      // Apply final limit per category
      // Hard filter: keep only docs that include every query token (if any)
      const tokenMatch = (r: SearchResult) => {
        const hay = (r.searchable_text || r.preview || r.title).toLowerCase();
        return queryTokens.every(t => hay.includes(t));
      };

      const finalText = textResults.filter(tokenMatch).slice(0, limit);
      const finalMedia = mediaResults.filter(tokenMatch).slice(0, limit);

      // Cheap keyword bump: if all query tokens appear in the preview (or title) give +0.15
      const bumpIfContains = (r: SearchResult) => {
        const hay = (r.searchable_text || r.preview || r.title).toLowerCase();
        return queryTokens.every(t => hay.includes(t));
      };
      for (const r of textResults) {
        if (bumpIfContains(r)) r.score += 0.15;
      }
      for (const r of mediaResults) {
        if (bumpIfContains(r)) r.score += 0.15;
      }

      const groupedResults = {
        media: finalMedia,
        text: finalText,
        all: [...finalMedia, ...finalText].sort((a, b) => b.score - a.score).slice(0, limit),
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
