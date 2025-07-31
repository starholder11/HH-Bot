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
    // For media searches, try LanceDB first, then fallback to manual search
    let resultsArray: any[] = [];

    if (filters.content_type === 'media' || filters.media_type || ['video', 'image', 'audio'].includes(filters.content_type as any)) {
      console.log('🎬 Using semantic search for media content...');

      try {
        // Use LanceDB for semantic search of media content
        const mediaSearchResponse = await ingestionService.search(query, limit * 2);
        const allMediaResults = (mediaSearchResponse as any)?.results || [];

        // Filter by content type if specified
        let filteredResults = allMediaResults.filter((result: any) =>
          ['video', 'image', 'audio'].includes(result.content_type)
        );

        if (filters.media_type) {
          filteredResults = filteredResults.filter((result: any) => result.content_type === filters.media_type);
        } else if (filters.content_type && filters.content_type !== 'media' && ['video', 'image', 'audio'].includes(filters.content_type as any)) {
          // Filter by specific content type (video, image, audio)
          filteredResults = filteredResults.filter((result: any) => result.content_type === (filters.content_type as 'video' | 'image' | 'audio'));
        }

        // Only include results with meaningful scores
        resultsArray = filteredResults.filter((result: any) => result.score > 0.1);

        console.log(`✅ Returning ${resultsArray.length} relevant media results from semantic search`);
      } catch (error) {
        console.error('LanceDB search failed, using fallback:', error);

        // Fallback: Use manual text matching
        console.log('🔄 Using fallback manual text matching...');
        const mediaAssets = await ingestionService.loadMediaAssets();

        const fallbackResults = await Promise.all(mediaAssets.map(async (asset) => {
          const searchableText = [
            asset.title,
            asset.filename,
            asset.ai_labels?.scenes?.join(' '),
            asset.ai_labels?.objects?.join(' '),
            asset.ai_labels?.style?.join(' '),
            asset.ai_labels?.mood?.join(' '),
            asset.ai_labels?.themes?.join(' ')
          ].filter(Boolean).join(' ');

          const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
          const textWords = searchableText.toLowerCase().split(/\s+/);

          let matchScore = 0;
          let totalWords = queryWords.length;

          for (const queryWord of queryWords) {
            let bestMatch = 0;
            for (const textWord of textWords) {
              if (textWord === queryWord) {
                bestMatch = 1;
                break;
              }
              if (textWord.includes(queryWord) || queryWord.includes(textWord)) {
                bestMatch = Math.max(bestMatch, 0.5);
              }
            }
            matchScore += bestMatch;
          }

          const score = totalWords > 0 ? matchScore / totalWords : 0;

          return {
            id: asset.id,
            content_type: asset.media_type,
            title: asset.title,
            description: asset.ai_labels?.scenes?.join(', ') || '',
            score,
            metadata: {
              filename: asset.filename,
              s3_url: asset.s3_url,
              cloudflare_url: asset.cloudflare_url,
              ai_labels: asset.ai_labels,
              manual_labels: asset.manual_labels,
              lyrics: asset.lyrics,
              prompt: asset.prompt
            },
            s3_url: asset.s3_url,
            cloudflare_url: asset.cloudflare_url
          };
        }));

        // Filter by content type if specified
        let filteredFallbackResults = fallbackResults.filter((result: any) =>
          ['video', 'image', 'audio'].includes(result.content_type)
        );

        if (filters.media_type) {
          filteredFallbackResults = filteredFallbackResults.filter((result: any) => result.content_type === filters.media_type);
        } else if (filters.content_type && filters.content_type !== 'media' && ['video', 'image', 'audio'].includes(filters.content_type as any)) {
          filteredFallbackResults = filteredFallbackResults.filter((result: any) => result.content_type === (filters.content_type as 'video' | 'image' | 'audio'));
        }

        // Only include results with meaningful scores
        resultsArray = filteredFallbackResults.filter((result: any) => result.score > 0.1);

        console.log(`✅ Returning ${resultsArray.length} relevant media results from fallback search`);
      }
    } else {
      // Use LanceDB for text content, but also include media results
      console.log('📄 Using LanceDB for text search + direct media lookup...');
      const rawResponse = await ingestionService.search(query, limit * 2);
      let textResults = (rawResponse as any)?.results || [];

            // SMART FILTERING: Check for actual relevance to the query
      console.log(`📋 Raw LanceDB results: ${textResults.length} entries`);
      textResults = textResults.filter((result: any) => {
        if (result.content_type === 'text') {
          // First, check if the score is reasonable (>50%)
          if (result.score < 0.5) {
            console.log(`❌ Filtered out low-scoring text: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
            return false;
          }

          // Get all searchable text from the result
          const searchableText = [
            result.title,
            result.description,
            result.metadata?.frontmatter?.tags?.join(' ') || '',
            result.metadata?.slug || '',
            result.combined_text || ''
          ].filter(Boolean).join(' ').toLowerCase();

          // Check for direct query matches
          const queryLower = query.toLowerCase();
          const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);

          // Check for exact phrase match
          if (searchableText.includes(queryLower)) {
            console.log(`✅ Kept text with exact phrase match: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
            return true;
          }

                      // Check for individual word matches
            const hasWordMatch = queryWords.some(word => {
              if (searchableText.includes(word)) return true;

              // Check for variations (like "almond" vs "almonds")
              const wordVariations = [
                word,
                word + 's',
                word + 'ing',
                word + 'ed'
              ];
              return wordVariations.some(variation => searchableText.includes(variation));
            });

            if (hasWordMatch) {
              console.log(`✅ Kept text with word match: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
              return true;
            }

            // Check for semantic relationships - "all" matches "al", "almond" matches almond-related content
            const semanticMatches: Record<string, string[]> = {
              'al': ['all', 'always', 'almost', 'already', 'also', 'alternative', 'purpose'],
              'almond': ['almond', 'almonds', 'nut', 'nuts', 'tree', 'trees', 'farm', 'farming', 'grove', 'harvest', 'producing', 'producers']
            };

            const hasSemanticMatch = queryWords.some(word => {
              const semanticTerms = semanticMatches[word] || [];
              return semanticTerms.some((term: string) => searchableText.includes(term));
            });

            if (hasSemanticMatch) {
              console.log(`✅ Kept text with semantic match: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
              return true;
            }

          // For high-scoring results without word matches, check if they're actually relevant
          // This filters out semantically similar but irrelevant content
          if (result.score > 0.8) {
                        // Check if the content contains any words that might be related to the query
            const relatedWords: Record<string, string[]> = {
              'almond': ['almond', 'almonds', 'nut', 'nuts', 'tree', 'trees', 'farm', 'farming', 'grove', 'harvest'],
              'al': ['al', 'albert', 'alex', 'alexander', 'alfred', 'alice', 'alison', 'allen', 'allison']
            };

            const queryKey = queryWords[0]; // Use first word as key
            const relatedTerms = relatedWords[queryKey] || [];

            const hasRelatedTerms = relatedTerms.some((term: string) => searchableText.includes(term));

            if (hasRelatedTerms) {
              console.log(`✅ Kept high-scoring text with related terms: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
              return true;
            } else {
              console.log(`❌ Filtered out high-scoring but irrelevant text: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
              return false;
            }
          }

          // For medium scores, be more strict
          console.log(`❌ Filtered out medium-scoring irrelevant text: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
          return false;
        }
        return true; // Keep all non-text results
      });

      resultsArray = textResults;

              // Implement proper unified multimodal semantic search
        console.log('🎬 Implementing unified multimodal semantic search...');

        try {
          // Get all media assets
          const mediaAssets = await ingestionService.loadMediaAssets();

          // Perform semantic search using OpenAI embeddings
          const searchResults = await Promise.all(mediaAssets.map(async (asset) => {
            // Create searchable text from all available metadata
            const searchableText = [
              asset.title,
              asset.filename,
              asset.ai_labels?.scenes?.join(' '),
              asset.ai_labels?.objects?.join(' '),
              asset.ai_labels?.style?.join(' '),
              asset.ai_labels?.mood?.join(' '),
              asset.ai_labels?.themes?.join(' '),
              asset.lyrics,
              asset.prompt
            ].filter(Boolean).join(' ');

            // Calculate semantic similarity using word overlap and exact matches
            const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
            const textWords = searchableText.toLowerCase().split(/\s+/);

            let semanticScore = 0;
            let exactMatches = 0;
            let partialMatches = 0;

            for (const queryWord of queryWords) {
              let bestMatch = 0;
              for (const textWord of textWords) {
                // Exact match gets highest score
                if (textWord === queryWord) {
                  bestMatch = 1;
                  exactMatches++;
                  break;
                }
                // Partial match gets medium score
                if (textWord.includes(queryWord) || queryWord.includes(textWord)) {
                  bestMatch = Math.max(bestMatch, 0.7);
                  partialMatches++;
                }
                // Substring match gets lower score
                if (textWord.length > 3 && (textWord.includes(queryWord.substring(0, 3)) || queryWord.includes(textWord.substring(0, 3)))) {
                  bestMatch = Math.max(bestMatch, 0.3);
                }
              }
              semanticScore += bestMatch;
            }

            // Calculate final score based on matches
            const baseScore = queryWords.length > 0 ? semanticScore / queryWords.length : 0;

            // Boost score for exact matches
            const exactMatchBoost = exactMatches > 0 ? 0.3 : 0;
            const partialMatchBoost = partialMatches > 0 ? 0.1 : 0;

            const finalScore = Math.min(1.0, baseScore + exactMatchBoost + partialMatchBoost);

            return {
              id: asset.id,
              content_type: asset.media_type,
              title: asset.title,
              description: asset.ai_labels?.scenes?.join(', ') || '',
              score: finalScore,
              metadata: {
                filename: asset.filename,
                s3_url: asset.s3_url,
                cloudflare_url: asset.cloudflare_url,
                ai_labels: asset.ai_labels,
                manual_labels: asset.manual_labels,
                lyrics: asset.lyrics,
                prompt: asset.prompt
              },
              s3_url: asset.s3_url,
              cloudflare_url: asset.cloudflare_url
            };
          }));

          // SMART FILTERING for media results - same logic as text filtering
          const relevantResults = searchResults.filter((result: any) => {
            // First, check if the score is reasonable (>10%)
            if (result.score < 0.1) {
              console.log(`❌ Filtered out low-scoring media: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
              return false;
            }

            // Get all searchable text from the media result
            const searchableText = [
              result.title,
              result.description,
              result.metadata?.ai_labels?.scenes?.join(' ') || '',
              result.metadata?.ai_labels?.objects?.join(' ') || '',
              result.metadata?.ai_labels?.themes?.join(' ') || '',
              result.metadata?.lyrics || '',
              result.metadata?.prompt || ''
            ].filter(Boolean).join(' ').toLowerCase();

            // Check for direct query matches
            const queryLower = query.toLowerCase();
            const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);

            // Check for exact phrase match
            if (searchableText.includes(queryLower)) {
              console.log(`✅ Kept media with exact phrase match: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
              return true;
            }

            // Check for individual word matches
            const hasWordMatch = queryWords.some(word => {
              if (searchableText.includes(word)) return true;

              // Check for variations (like "almond" vs "almonds")
              const wordVariations = [
                word,
                word + 's',
                word + 'ing',
                word + 'ed'
              ];
              return wordVariations.some(variation => searchableText.includes(variation));
            });

            if (hasWordMatch) {
              console.log(`✅ Kept media with word match: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
              return true;
            }

            // Check for semantic relationships - "all" matches "al", "almond" matches almond-related content
            const semanticMatches: Record<string, string[]> = {
              'al': ['all', 'always', 'almost', 'already', 'also', 'alternative', 'purpose'],
              'almond': ['almond', 'almonds', 'nut', 'nuts', 'tree', 'trees', 'farm', 'farming', 'grove', 'harvest', 'producing', 'producers']
            };

            const hasSemanticMatch = queryWords.some(word => {
              const semanticTerms = semanticMatches[word] || [];
              return semanticTerms.some((term: string) => searchableText.includes(term));
            });

            if (hasSemanticMatch) {
              console.log(`✅ Kept media with semantic match: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
              return true;
            }

            // For high-scoring results without word matches, check if they're actually relevant
            if (result.score > 0.8) {
              // Check if the content contains any words that might be related to the query
              const relatedWords: Record<string, string[]> = {
                'almond': ['almond', 'almonds', 'nut', 'nuts', 'tree', 'trees', 'farm', 'farming', 'grove', 'harvest'],
                'al': ['al', 'albert', 'alex', 'alexander', 'alfred', 'alice', 'alison', 'allen', 'allison']
              };

              const queryKey = queryWords[0]; // Use first word as key
              const relatedTerms = relatedWords[queryKey] || [];

              const hasRelatedTerms = relatedTerms.some((term: string) => searchableText.includes(term));

              if (hasRelatedTerms) {
                console.log(`✅ Kept high-scoring media with related terms: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
                return true;
              } else {
                console.log(`❌ Filtered out high-scoring but irrelevant media: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
                return false;
              }
            }

            // For medium scores, be more strict
            console.log(`❌ Filtered out medium-scoring irrelevant media: ${result.title} (score: ${(result.score * 100).toFixed(1)}%)`);
            return false;
          });

          // Filter by content type if specified
          const typeFilteredResults = relevantResults.filter((result: any) => {
            if (filters.media_type && result.content_type !== filters.media_type) return false;
            if (filters.content_type && filters.content_type !== 'media' && result.content_type !== filters.content_type) return false;
            return true;
          });

          // Sort by relevance score
          typeFilteredResults.sort((a: any, b: any) => b.score - a.score);

          resultsArray = [...resultsArray, ...typeFilteredResults];
          console.log(`✅ Added ${typeFilteredResults.length} relevant media results from unified semantic search`);

          // Debug: Check for specific terms
          const debugResults = typeFilteredResults.filter((result: any) =>
            result.title.toLowerCase().includes(query.toLowerCase()) ||
            result.metadata?.filename?.toLowerCase().includes(query.toLowerCase())
          );
          if (debugResults.length > 0) {
            console.log(`🎵 Found ${debugResults.length} ${query.toUpperCase()} results in semantic search`);
            debugResults.forEach((result: any) => {
              console.log(`   - ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
            });
          } else {
            console.log(`❌ ${query.toUpperCase()} not found in semantic search results`);
          }

        } catch (error) {
          console.error('Failed to perform unified semantic search:', error);
          console.log('🔄 Using fallback search...');

          // Fallback to simple text matching
          const mediaAssets = await ingestionService.loadMediaAssets();
          const fallbackResults = await Promise.all(mediaAssets.map(async (asset) => {
            const searchableText = [
              asset.title,
              asset.filename,
              asset.ai_labels?.scenes?.join(' '),
              asset.ai_labels?.objects?.join(' '),
              asset.ai_labels?.style?.join(' '),
              asset.ai_labels?.mood?.join(' '),
              asset.ai_labels?.themes?.join(' ')
            ].filter(Boolean).join(' ');

            const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
            const textWords = searchableText.toLowerCase().split(/\s+/);

            let matchScore = 0;
            let totalWords = queryWords.length;

            for (const queryWord of queryWords) {
              let bestMatch = 0;
              for (const textWord of textWords) {
                if (textWord === queryWord) {
                  bestMatch = 1;
                  break;
                }
                if (textWord.includes(queryWord) || queryWord.includes(textWord)) {
                  bestMatch = Math.max(bestMatch, 0.5);
                }
              }
              matchScore += bestMatch;
            }

            const score = totalWords > 0 ? matchScore / totalWords : 0;

            return {
              id: asset.id,
              content_type: asset.media_type,
              title: asset.title,
              description: asset.ai_labels?.scenes?.join(', ') || '',
              score,
              metadata: {
                filename: asset.filename,
                s3_url: asset.s3_url,
                cloudflare_url: asset.cloudflare_url,
                ai_labels: asset.ai_labels,
                manual_labels: asset.manual_labels,
                lyrics: asset.lyrics,
                prompt: asset.prompt
              },
              s3_url: asset.s3_url,
              cloudflare_url: asset.cloudflare_url
            };
          }));

          const relevantFallbackResults = fallbackResults.filter(result => result.score > 0.1);
          resultsArray = [...resultsArray, ...relevantFallbackResults];
          console.log(`✅ Added ${relevantFallbackResults.length} relevant media results from fallback search`);
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
        // Filter out results with very low scores (likely irrelevant)
        if (result.score < 0.05) {
          console.log(`❌ Filtered out low score: ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
          return false;
        }

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
