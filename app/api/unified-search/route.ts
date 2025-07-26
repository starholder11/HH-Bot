import { NextRequest, NextResponse } from 'next/server';
import LanceDBIngestionService from '@/lib/lancedb-ingestion';

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

    // TEMPORARY FIX: LanceDB vector search is broken for media content
    // For media searches, bypass LanceDB and use direct S3 lookup
    let resultsArray: any[] = [];

        if (filters.content_type === 'media' || filters.media_type || ['video', 'image', 'audio'].includes(filters.content_type as any)) {
      console.log('🎬 Using direct media search (bypassing LanceDB)...');

      // Load media assets directly from S3
      const mediaAssets = await ingestionService.loadMediaAssets();
      console.log(`📁 Found ${mediaAssets.length} media assets from S3`);

      // Filter by media type if specified
      let filteredAssets = mediaAssets;
      if (filters.media_type) {
        filteredAssets = mediaAssets.filter(asset => asset.media_type === filters.media_type);
      } else if (filters.content_type && filters.content_type !== 'media' && ['video', 'image', 'audio'].includes(filters.content_type as any)) {
        // Filter by specific content type (video, image, audio)
        filteredAssets = mediaAssets.filter(asset => asset.media_type === (filters.content_type as 'video' | 'image' | 'audio'));
      }

      // Convert to search result format
      resultsArray = filteredAssets.slice(0, limit).map(asset => ({
        id: asset.id,
        content_type: asset.media_type,
        title: asset.title,
        description: `${asset.media_type}: ${asset.filename}`,
        score: 0.8, // Default high score for media
        metadata: asset,
        s3_url: asset.s3_url,
        cloudflare_url: asset.cloudflare_url
      }));

      console.log(`✅ Returning ${resultsArray.length} media results`);
    } else {
      // Use LanceDB for text content, but also include media results
      console.log('📄 Using LanceDB for text search + direct media lookup...');
      const rawResponse = await ingestionService.search(query, limit * 2);
      let textResults = (rawResponse as any)?.results || [];

              // TEMPORARY FIX: Filter out irrelevant text results with artificially high scores
        // This addresses the LanceDB corruption issue where random text gets high scores
        textResults = textResults.filter((result: any) => {
          // If it's a text result with >80% score, check if it's actually relevant
          if (result.content_type === 'text' && result.score > 0.8) {
            // Check multiple sources for relevance
            const searchableText = [
              result.title,
              result.description,
              result.metadata?.frontmatter?.tags?.join(' ') || '',
              result.metadata?.slug || '', // Add slug to searchable text
              result.combined_text || '' // Add the actual content text
            ].filter(Boolean).join(' ').toLowerCase();

            const queryWords = query.toLowerCase().split(/\s+/);
            const hasRelevantMatch = queryWords.some(word =>
              searchableText.includes(word) ||
              word.length > 3 && searchableText.includes(word.substring(0, 3))
            );

            // Only keep high-scoring results that actually contain query words
            return hasRelevantMatch;
          }
          return true; // Keep all other results
        });

      resultsArray = textResults;

      // Also add media results for comprehensive search
      try {
        const mediaAssets = await ingestionService.loadMediaAssets();

        // Calculate semantic similarity scores for media
        const mediaResults = await Promise.all(mediaAssets.map(async (asset) => {
          // Create searchable text from media metadata
          const searchableText = [
            asset.title,
            asset.filename,
            asset.ai_labels?.scenes?.join(' '),
            asset.ai_labels?.objects?.join(' '),
            asset.ai_labels?.style?.join(' '),
            asset.ai_labels?.mood?.join(' '),
            asset.ai_labels?.themes?.join(' ')
          ].filter(Boolean).join(' ');

          // Calculate more accurate text similarity
          const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
          const textWords = searchableText.toLowerCase().split(/\s+/);

          let matchScore = 0;
          let totalWords = queryWords.length;

          for (const queryWord of queryWords) {
            // Check for exact matches first, then partial matches
            if (textWords.some(word => word === queryWord)) {
              matchScore += 1;
            } else if (textWords.some(word => word.includes(queryWord) || queryWord.includes(word))) {
              matchScore += 0.5; // Partial match gets half score
            }
          }

          // Convert to percentage score (0-1)
          const similarityScore = totalWords > 0 ? matchScore / totalWords : 0;

          // Remove filename boosting entirely to prevent irrelevant results
          const finalScore = Math.min(0.99, similarityScore);

          return {
            id: asset.id,
            content_type: asset.media_type,
            title: asset.title,
            description: `${asset.media_type}: ${asset.filename}`,
            score: finalScore,
            metadata: asset,
            s3_url: asset.s3_url,
            cloudflare_url: asset.cloudflare_url
          };
        }));

                resultsArray = [...resultsArray, ...mediaResults];
        console.log(`✅ Added ${mediaResults.length} media results with semantic scoring`);

        // Debug: Check for HOMBRE specifically
        const hombreResults = mediaResults.filter(result =>
          result.title.toLowerCase().includes('hombre') ||
          result.metadata?.filename?.toLowerCase().includes('hombre')
        );
        if (hombreResults.length > 0) {
          console.log(`🎵 Found ${hombreResults.length} HOMBRE results in media results`);
          hombreResults.forEach(result => {
            console.log(`   - ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
          });
        } else {
          console.log(`❌ HOMBRE not found in media results`);
        }


      } catch (error) {
        console.error('Failed to add media results:', error);
      }
    }

    // Process and filter results
    console.log(`🔍 Processing ${resultsArray.length} total results (text + media)`);

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
      .filter((result: SearchResult) => {
        const passes = applyFilters(result, filters);
        if (!passes) {
          console.log(`❌ Filtered out: ${result.title} (${result.content_type})`);
        }
        return passes;
      })
      .sort((a, b) => b.score - a.score) // Sort by score DESC so media appears in top results
      .slice(0, limit);

    // Debug: Check final results for media
    const mediaResults = processedResults.filter(r => ['video', 'image', 'audio'].includes(r.content_type));
    console.log(`📊 Media results after filtering: ${mediaResults.length}`);
    mediaResults.slice(0, 3).forEach(result => {
      console.log(`   - ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
    });



    console.log(`✅ Final processed results: ${processedResults.length} (${processedResults.filter(r => ['video', 'image', 'audio'].includes(r.content_type)).length} media)`);

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
  if (result.content_type === 'audio' || result.content_type === 'video' || result.content_type === 'image') {
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
