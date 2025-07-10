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

// Function to test a single timeline entry
async function testTimelineEntry(slug: string): Promise<{ slug: string; success: boolean; error?: string }> {
  const url = `http://localhost:3000/keystatic/collection/timeline/item/${slug}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Timeline-Test-Script'
      }
    });
    
    if (response.ok) {
      return { slug, success: true };
    } else {
      return { 
        slug, 
        success: false, 
        error: `HTTP ${response.status}: ${response.statusText}` 
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

// Function to test all timeline entries
async function testAllTimelineEntries() {
  console.log('🧪 Starting timeline entry testing...\n');
  
  const entries = getAllTimelineEntries();
  console.log(`Found ${entries.length} timeline entries to test\n`);
  
  const results: { slug: string; success: boolean; error?: string }[] = [];
  const failed: string[] = [];
  
  // Test entries in batches to avoid overwhelming the server
  const batchSize = 5;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    
    console.log(`Testing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entries.length / batchSize)}: ${batch.join(', ')}`);
    
    const batchPromises = batch.map(slug => testTimelineEntry(slug));
    const batchResults = await Promise.all(batchPromises);
    
    results.push(...batchResults);
    
    // Log results for this batch
    for (const result of batchResults) {
      if (result.success) {
        console.log(`  ✅ ${result.slug}`);
      } else {
        console.log(`  ❌ ${result.slug}: ${result.error}`);
        failed.push(result.slug);
      }
    }
    
    // Wait a bit between batches to avoid overwhelming the server
    if (i + batchSize < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('');
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  console.log(`\n📊 Test Summary:`);
  console.log(`Total entries: ${entries.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed entries:`);
    failed.forEach(slug => {
      const result = results.find(r => r.slug === slug);
      console.log(`  - ${slug}: ${result?.error || 'Unknown error'}`);
    });
  } else {
    console.log(`\n🎉 All timeline entries loaded successfully!`);
  }
  
  return { successful, failed, total: entries.length };
}

// Run the test
testAllTimelineEntries()
  .then((summary) => {
    process.exit(summary.failed.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('Test script failed:', error);
    process.exit(1);
  }); 