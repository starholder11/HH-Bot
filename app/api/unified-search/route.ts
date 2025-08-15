import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory cache for query embeddings to avoid repeated OpenAI calls
// Note: Serverless may evict between cold starts, but this helps during warm periods
const embedCache: Map<string, { embedding: number[]; ts: number }> = new Map();
const EMBED_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface SearchResult {
  id: string;
  content_type: 'video' | 'image' | 'audio' | 'text' | 'layout';
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
  content_type?: 'media' | 'text' | 'layout' | 'all';
  media_type?: 'image' | 'video' | 'audio' | 'layout';
  date_range?: {
    start: string;
    end: string;
  };
  tags?: string[];
}

export async function POST(request: NextRequest) {
  console.log('🚀 CORRUPTED DATA FIX DEPLOYED - handling [object Object] in searchable text');
  try {
    const {
      query,
      limit = 1000,
      page = 1,
      content_types = [],
      filters = {},
      fast = false
    }: {
      query: string;
      limit?: number;
      page?: number;
      content_types?: string[];
      filters?: SearchFilters;
      fast?: boolean;
    } = await request.json();

    const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 1000));
    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * safeLimit;
    const queryTokens = query.toLowerCase().split(/\s+/).filter(tok => tok.length > 2);

    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        error: 'Query parameter is required'
      }, { status: 400 });
    }

    console.log(`🔍 FIXED VERSION - Unified search query: "${query}" limit: ${safeLimit} page: ${safePage}`);

    // Get OpenAI API key with proper validation and cleaning
    let openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY environment variable is not set' }, { status: 500 });
    }

    // Clean the key - remove any whitespace, newlines, or other garbage
    openaiApiKey = openaiApiKey.trim();

    // Validate key format
    if (!openaiApiKey.startsWith('sk-')) {
      console.warn('Invalid OpenAI API key format, returning empty results for unified search');
      return NextResponse.json({
        success: true,
        query,
        page: safePage,
        limit: safeLimit,
        total: 0,
        results: {
          all: [],
          media: [],
          text: [],
          layouts: []
        }
      });
    }

    console.log('🔑 Using OpenAI key:', `${openaiApiKey.slice(0, 10)}...${openaiApiKey.slice(-4)}`);

    const authHeader = `Bearer ${openaiApiKey}`;
    const normalizedQuery = query.trim().toLowerCase();
    let queryEmbedding: number[];

    // Try cache first
    const cached = embedCache.get(normalizedQuery);
    if (cached && Date.now() - cached.ts < EMBED_TTL_MS) {
      queryEmbedding = cached.embedding;
    } else {
      const embedResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: normalizedQuery
        })
      });

      if (!embedResponse.ok) {
        const errText = await embedResponse.text();
        console.log('❌ OpenAI API Error:', embedResponse.status, errText);
        return NextResponse.json({ error: 'OpenAI embedding failed', details: errText }, { status: 502 });
      }
      const { data: embedData } = await embedResponse.json();
      queryEmbedding = embedData[0].embedding as number[];
      embedCache.set(normalizedQuery, { embedding: queryEmbedding, ts: Date.now() });
    }

    // Call the LanceDB service specified by env
    // Prefer LANCEDB_URL (public-facing) for Vercel; fall back to internal API URL for Lambdas/local
const lancedbUrl = process.env.LANCEDB_URL || process.env.LANCEDB_API_URL || 'http://localhost:8000';

    try {
      const searchResponse = await fetch(`${lancedbUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query_embedding: queryEmbedding,
          // Fast mode: smaller initial pool for quicker response; Full mode: larger pool
          limit: fast
            ? Math.min(400, Math.max(safeLimit * 2, safeLimit))
            : Math.min(1000, Math.max(safeLimit * 4, safeLimit)),
        }),
      });

      if (!searchResponse.ok) {
        throw new Error(`LanceDB search failed: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();
      const results = Array.isArray(searchData) ? searchData : (searchData.results || []);

      console.log(`📊 Got ${results.length} results from LanceDB`);

      // Search layout assets if requested
      let layoutResults: SearchResult[] = [];
      try {
        if (content_types.length === 0 || content_types.includes('layout') || content_types.includes('all')) {
          console.log(`🎨 Searching layout assets for query: "${query}"`);
          const { searchMediaAssets } = await import('../../../lib/media-storage');
          const layouts = await searchMediaAssets(query, 'layout');

          layoutResults = layouts.filter(layout => layout.media_type === 'layout').map(layout => {
            // Safe type assertion - we know these are layout assets
            const layoutAsset = layout as any;
            const description = layoutAsset.description || layout.ai_labels?.themes?.join(', ') || layout.filename;

            return {
              id: layout.id,
              content_type: 'layout' as const,
              title: layout.title,
              description,
              score: 0.8, // Default high relevance for layout matches
              metadata: {
                ...layout,
                s3_url: layout.s3_url,
                cloudflare_url: layout.cloudflare_url,
                layout_type: layoutAsset.layout_type || 'canvas_export',
                item_count: layout.metadata?.item_count || 0,
                has_inline_content: layout.metadata?.has_inline_content || false,
                width: layout.metadata?.width || 0,
                height: layout.metadata?.height || 0,
              },
              url: layout.s3_url,
              s3_url: layout.s3_url,
              cloudflare_url: layout.cloudflare_url,
              preview: `Layout: ${layout.title} (${layout.metadata?.item_count || 0} items)`,
              searchable_text: [
                layout.title,
                description,
                layout.ai_labels?.themes?.join(' ') || '',
                layout.manual_labels?.custom_tags?.join(' ') || '',
                (layoutAsset.layout_data?.items || []).map((item: any) => item.snippet || '').join(' ')
              ].filter(Boolean).join(' ')
            };
          });

          console.log(`🎨 Found ${layoutResults.length} layout assets`);
        }
      } catch (error) {
        console.warn('Layout search failed:', error);
      }

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

      // Add layout results to the processed results
      const allResults = [...processedResults, ...layoutResults]
        .sort((a: any, b: any) => b.score - a.score);

      console.log(`✅ Returning ${allResults.length} filtered results (${processedResults.length} from LanceDB, ${layoutResults.length} layouts)`);

      // --- Aggregate top-3 chunk similarity per document ---
      const mediaResults: SearchResult[] = [];
      const layoutResultsFiltered: SearchResult[] = [];
      const docMap = new Map<string, { rep: SearchResult; scores: number[] }>();

      for (const res of allResults) {
        if (['video', 'image', 'audio'].includes(res.content_type)) {
          mediaResults.push(res);
          continue;
        }
        if (res.content_type === 'layout') {
          layoutResultsFiltered.push(res);
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

      // Apply final ordering (no limit yet; paginate after blending)
      // Flexible filter: prioritize title matches and rely on semantic similarity
      const tokenMatch = (r: SearchResult) => {
        const hay = (r.searchable_text || r.preview || r.title).toLowerCase();
        const titleLower = r.title.toLowerCase();
        const queryLower = query.toLowerCase();

        // Exact title match always passes
        if (titleLower.includes(queryLower)) return true;

        // Handle corrupted searchable text with [object Object]
        if (hay.includes('[object object]')) {
          // For corrupted data, just check if title contains any query tokens
          return queryTokens.some(t => titleLower.includes(t));
        }

        // For multi-word queries, require at least 80% of tokens to match
        if (queryTokens.length > 1) {
          const matchingTokens = queryTokens.filter(t => hay.includes(t)).length;
          return matchingTokens >= Math.ceil(queryTokens.length * 0.8);
        }

        // Single word queries use original logic
        return queryTokens.every(t => hay.includes(t));
      };

      // Token-aware boosting before taking top-N
      for (const r of textResults) {
        if (tokenMatch(r)) r.score += 0.35; // stronger bump for text
      }
      for (const r of mediaResults) {
        if (tokenMatch(r)) r.score += 0.2;
      }

      // After boosting, re-sort
      textResults.sort((a, b) => b.score - a.score);
      mediaResults.sort((a, b) => b.score - a.score);

      const finalText = textResults; // full ordered list
      const finalMedia = mediaResults; // full ordered list

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

      // Apply content type filtering to final results
      const filterByContentTypes = (results: SearchResult[]) => {
        if (content_types.length === 0) return results;

        return results.filter(r => {
          const mediaTypes = ['video', 'image', 'audio'];
          const matches = content_types.includes(r.content_type) ||
            (content_types.includes('media') && mediaTypes.includes(r.content_type)) ||
            (content_types.includes('layout') && r.content_type === 'layout');
          return matches;
        });
      };

      const filteredMedia = filterByContentTypes(finalMedia);
      const filteredText = filterByContentTypes(finalText);
      const filteredLayouts = filterByContentTypes(layoutResultsFiltered);

      // Blend media, text, and layouts for the unified "all" list
      const textQuota = Math.max(1, Math.ceil(safeLimit * 0.5));
      const mediaQuota = Math.max(0, Math.ceil(safeLimit * 0.3));
      const layoutQuota = Math.max(0, safeLimit - textQuota - mediaQuota);

      const topText = filteredText.slice(0, textQuota);
      const topMedia = filteredMedia.slice(0, mediaQuota);
      const topLayouts = filteredLayouts.slice(0, layoutQuota);

      // Interleave to keep the feed varied: text, media, layout rotation
      const blendedAll: SearchResult[] = [];
      const maxLen = Math.max(topText.length, topMedia.length, topLayouts.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < topText.length) blendedAll.push(topText[i]);
        if (i < topMedia.length) blendedAll.push(topMedia[i]);
        if (i < topLayouts.length) blendedAll.push(topLayouts[i]);
      }
      // If any remaining due to quota mismatch, append rest
      if (blendedAll.length < (topText.length + topMedia.length + topLayouts.length)) {
        const extras = filteredText.slice(topText.length)
          .concat(filteredMedia.slice(topMedia.length))
          .concat(filteredLayouts.slice(topLayouts.length));
        for (const e of extras) blendedAll.push(e);
      }

      // Now paginate
      const pagedAll = blendedAll.slice(offset, offset + safeLimit);
      const pagedMedia = filteredMedia.slice(offset, offset + safeLimit);
      const pagedText = filteredText.slice(offset, offset + safeLimit);
      const pagedLayouts = filteredLayouts.slice(offset, offset + safeLimit);

      const groupedResults = {
        media: pagedMedia,
        text: pagedText,
        layout: pagedLayouts,
        all: pagedAll,
      };

      const responseData = {
        success: true,
        query,
        total_results: allResults.length, // Include layout results in total
        page: safePage,
        page_size: safeLimit,
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
              limit: parseInt(searchParams.get('limit') || '1000'),
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
    } else if (filters.content_type === 'layout') {
      // For 'layout' filter, only accept layout content
      if (result.content_type !== 'layout') {
        return false;
      }
    } else if (result.content_type !== filters.content_type) {
      return false;
    }
  }

  // Media type filter (applies to media content and layout)
  if (filters.media_type) {
    if (['video', 'image', 'audio'].includes(result.content_type)) {
      if (result.content_type !== filters.media_type) {
        return false;
      }
    } else if (filters.media_type === 'layout' && result.content_type !== 'layout') {
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
    } else if (result.content_type === 'layout') {
      // For layout content, check AI labels and custom tags
      const allLabels = [
        ...(result.metadata?.ai_labels?.themes || []),
        ...(result.metadata?.ai_labels?.style || []),
        ...(result.metadata?.manual_labels?.custom_tags || []),
        result.metadata?.layout_type || ''
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
