#!/usr/bin/env tsx

async function testUnifiedSearchFix() {
  console.log('🔍 Testing unified search fix...\n');

  // Test the unified search API directly
  const unifiedSearchUrl = 'http://localhost:3001/api/unified-search';

  console.log('📤 Testing unified search for video content...');
  const searchResponse = await fetch(unifiedSearchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'Barry dinner video',
      limit: 10,
      filters: {
        content_type: 'media'
      }
    }),
  });

  const searchResult = await searchResponse.json();
  console.log('Unified search result:', JSON.stringify(searchResult, null, 2));

  if (searchResult.results?.media?.length > 0) {
    console.log('🎉 SUCCESS: Unified search returned media results!');
    console.log('Media results count:', searchResult.results.media.length);
    searchResult.results.media.forEach((result: any, index: number) => {
      console.log(`  ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
    });
  } else {
    console.log('❌ No media results in unified search');
    console.log('Text results count:', searchResult.results?.text?.length || 0);
    console.log('Total results:', searchResult.total_results || 0);
  }

  // Test specific video search
  console.log('\n📤 Testing specific video search...');
  const videoSearchResponse = await fetch(unifiedSearchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'direct test video',
      limit: 5,
      filters: {
        content_type: 'media',
        media_type: 'video'
      }
    }),
  });

  const videoSearchResult = await videoSearchResponse.json();
  console.log('Video search result:', JSON.stringify(videoSearchResult, null, 2));
}

testUnifiedSearchFix().catch(console.error);
