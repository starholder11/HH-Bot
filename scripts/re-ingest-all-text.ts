#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

async function reIngestAllText() {
  console.log('🔄 Re-ingesting ALL text content with cleaned embeddings...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Load all text content from local files
    console.log('\n📄 Step 1: Loading text content from local files...');

    const textContent: any[] = [];

    // Load posts
    const postsDir = path.join(process.cwd(), 'content', 'posts');
    if (fs.existsSync(postsDir)) {
      const postFiles = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));
      for (const file of postFiles) {
        const filePath = path.join(postsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);

        textContent.push({
          slug: `posts/${file.replace('.md', '')}`,
          title: frontmatter.title || file.replace('.md', ''),
          description: frontmatter.description || '',
          content: markdownContent,
          frontmatter,
          file_path: filePath
        });
      }
    }

    // Load timeline entries
    const timelineDir = path.join(process.cwd(), 'content', 'timeline');
    if (fs.existsSync(timelineDir)) {
      const timelineFolders = fs.readdirSync(timelineDir).filter(f =>
        fs.statSync(path.join(timelineDir, f)).isDirectory()
      );

      for (const folder of timelineFolders) {
        const contentPath = path.join(timelineDir, folder, 'content.mdx');
        if (fs.existsSync(contentPath)) {
          const content = fs.readFileSync(contentPath, 'utf8');
          const { data: frontmatter, content: markdownContent } = matter(content);

          textContent.push({
            slug: `timeline/${folder}`,
            title: frontmatter.title || folder,
            description: frontmatter.description || '',
            content: markdownContent,
            frontmatter,
            file_path: contentPath
          });
        }
      }
    }

    console.log(`✅ Loaded ${textContent.length} text files from local filesystem`);

    // Step 2: Process and add each text file with cleaned embeddings
    console.log('\n📤 Step 2: Re-ingesting with cleaned embeddings...');
    let successCount = 0;
    let errorCount = 0;

    for (const content of textContent) {
      try {
        console.log(`📝 Processing: ${content.slug}`);

        // Process with cleaned embeddings
        const record = await ingestionService.processTextContent(content);

        // Add to LanceDB (this will overwrite existing record with same ID)
        await ingestionService.addToLanceDB(record);

        successCount++;
        console.log(`✅ Added: ${content.slug}`);
      } catch (error) {
        console.error(`❌ Failed to process ${content.slug}:`, error);
        errorCount++;
      }
    }

    console.log(`\n🎉 Re-ingestion complete!`);
    console.log(`✅ Successfully processed: ${successCount} files`);
    console.log(`❌ Errors: ${errorCount} files`);

    // Step 3: Test the fix
    console.log('\n🧪 Step 3: Testing the fix...');

    console.log('Testing search for "hyperreal hospitality"...');
    const relevantResults = await ingestionService.search('hyperreal hospitality', 5);
    console.log('Relevant search results:');
    if (Array.isArray(relevantResults)) {
      relevantResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('Search results:', relevantResults);
    }

    console.log('\nTesting search for "barry_lyndon"...');
    const irrelevantResults = await ingestionService.search('barry_lyndon', 5);
    console.log('Irrelevant search results:');
    if (Array.isArray(irrelevantResults)) {
      irrelevantResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('Search results:', irrelevantResults);
    }

    // Test with a specific timeline entry
    console.log('\nTesting search for "above the clouds"...');
    const timelineResults = await ingestionService.search('above the clouds', 5);
    console.log('Timeline search results:');
    if (Array.isArray(timelineResults)) {
      timelineResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('Search results:', timelineResults);
    }

  } catch (error) {
    console.error('❌ Re-ingestion failed:', error);
  }
}

reIngestAllText().catch(console.error);
