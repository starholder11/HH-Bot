import fs from 'fs';
import path from 'path';

// Function to get all timeline entry slugs
function getAllTimelineEntries(): string[] {
  const timelineDir = 'content/timeline';
  const entries: string[] = [];
  
  try {
    const items = fs.readdirSync(timelineDir, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory()) {
        const indexYamlPath = path.join(timelineDir, item.name, 'index.yaml');
        if (fs.existsSync(indexYamlPath)) {
          entries.push(item.name);
        }
      }
    }
  } catch (error) {
    console.error('Error reading timeline directory:', error);
  }
  
  return entries.sort();
}

// Function to test a single public timeline page
async function testPublicTimelinePage(slug: string): Promise<{ slug: string; success: boolean; error?: string; status?: number }> {
  const url = `http://localhost:3000/timeline/${slug}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Timeline-Public-Test-Script'
      }
    });
    
    if (response.ok) {
      // Check if the response is actually HTML content
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        return { slug, success: true, status: response.status };
      } else {
        return { 
          slug, 
          success: false, 
          error: `Invalid content type: ${contentType}`,
          status: response.status
        };
      }
    } else {
      return { 
        slug, 
        success: false, 
        error: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status
      };
    }
  } catch (error) {
    return { 
      slug, 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Function to test all public timeline pages
async function testAllPublicTimelinePages() {
  console.log('🌐 Starting public timeline pages testing...\n');
  
  const entries = getAllTimelineEntries();
  console.log(`Found ${entries.length} timeline entries to test\n`);
  
  if (entries.length === 0) {
    console.log('❌ No timeline entries found!');
    return { successful: 0, failed: 0, total: 0 };
  }
  
  const results: { slug: string; success: boolean; error?: string; status?: number }[] = [];
  const failed: string[] = [];
  
  // Test entries in smaller batches to avoid overwhelming the server
  const batchSize = 3;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    
    console.log(`Testing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entries.length / batchSize)}: ${batch.join(', ')}`);
    
    const batchPromises = batch.map(slug => testPublicTimelinePage(slug));
    const batchResults = await Promise.all(batchPromises);
    
    results.push(...batchResults);
    
    // Log results for this batch
    for (const result of batchResults) {
      if (result.success) {
        console.log(`  ✅ /timeline/${result.slug} (${result.status})`);
      } else {
        console.log(`  ❌ /timeline/${result.slug}: ${result.error}`);
        failed.push(result.slug);
      }
    }
    
    // Wait a bit between batches to avoid overwhelming the server
    if (i + batchSize < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('');
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  console.log(`\n📊 Test Summary:`);
  console.log(`Timeline entries: ${successful}/${entries.length}`);
  console.log(`Total successful: ${successful}/${entries.length}`);
  console.log(`Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed pages:`);
    failed.forEach(slug => {
      const result = results.find(r => r.slug === slug);
      console.log(`  - /timeline/${slug}: ${result?.error || 'Unknown error'}`);
    });
  } else {
    console.log(`\n🎉 All public timeline pages loaded successfully!`);
  }
  
  return { 
    successful, 
    failed: failed.length, 
    total: entries.length 
  };
}

// Run the test
testAllPublicTimelinePages()
  .then((summary) => {
    process.exit(summary.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('Test script failed:', error);
    process.exit(1);
  }); 