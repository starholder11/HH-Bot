#!/usr/bin/env tsx

import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// LanceDB service endpoint
const LANCEDB_API_URL = process.env.LANCEDB_API_URL ||
  'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

interface TextContent {
  slug: string;
  title: string;
  description?: string;
  content: string;
  frontmatter: any;
  file_path: string;
}

interface LanceDBRecord {
  id: string;
  content_type: 'media' | 'text';
  title: string;
  description: string;
  combined_text: string;
  embedding: number[];
  metadata: any;
  url?: string;
  s3_url?: string;
  cloudflare_url?: string;
  created_at: string;
  updated_at: string;
}

async function ingestAllPurposeBees() {
  console.log('🐝 Ingesting "All Purpose Bees" content into LanceDB...');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Define the "All Purpose Bees" content files
  const allPurposeBeesFiles = [
    'all-purpose-bees',
    'all-purpose-bees-chapter-1',
    'all-purpose-bees-chapter-2',
    'all-purpose-bees-chapter-3',
    'all-purpose-bees-chapter-4'
  ];

  const contents: TextContent[] = [];

  // Load content from local files
  for (const slug of allPurposeBeesFiles) {
    try {
      const indexPath = path.join(process.cwd(), 'content', 'timeline', slug, 'index.yaml');
      const contentPath = path.join(process.cwd(), 'content', 'timeline', slug, 'content.mdx');

      if (fs.existsSync(indexPath) && fs.existsSync(contentPath)) {
        const yamlContent = fs.readFileSync(indexPath, 'utf-8');
        const mdxContent = fs.readFileSync(contentPath, 'utf-8');

        // Parse YAML frontmatter
        const { data: frontmatter } = matter(yamlContent);

        contents.push({
          slug: `timeline/${slug}`,
          title: frontmatter.title || slug,
          description: frontmatter.description,
          content: mdxContent,
          frontmatter,
          file_path: contentPath,
        });

        console.log(`✅ Loaded: ${slug}`);
      } else {
        console.log(`⚠️ Missing files for: ${slug}`);
      }
    } catch (error) {
      console.error(`❌ Error loading ${slug}:`, error);
    }
  }

  console.log(`📋 Loaded ${contents.length} "All Purpose Bees" content files`);

  // Process and ingest each content file
  for (const content of contents) {
    try {
      console.log(`\n🔄 Processing: ${content.title}`);

      // Clean and normalize text content for better embeddings
      const cleanContent = content.content
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`[^`]*`/g, '') // Remove inline code
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Convert links to text
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // Convert images to text
        .replace(/[#*_~`]/g, '') // Remove markdown formatting
        .replace(/\n+/g, ' ') // Normalize line breaks
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      // Generate embedding
      console.log(`🔍 Generating embedding for: ${content.title}`);
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: cleanContent,
      });

      const embedding = embeddingResponse.data[0].embedding;
      console.log(`✅ Generated embedding: ${embedding.length} dimensions`);

      // Create LanceDB record
      const record = {
        id: `text_${content.slug}`,
        content_type: 'text',
        title: content.title,
        content_text: cleanContent,
        references: {},
        metadata: {
          slug: content.slug,
          frontmatter: content.frontmatter,
          file_path: content.file_path,
          word_count: cleanContent.split(' ').length
        }
      };

      // Send to LanceDB
      console.log(`📤 Sending to LanceDB: ${record.id}`);
      const response = await fetch(`${LANCEDB_API_URL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(record),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LanceDB insertion failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ Successfully ingested: ${record.id}`);

    } catch (error) {
      console.error(`❌ Failed to process ${content.title}:`, error);
    }
  }

  console.log('\n🎉 "All Purpose Bees" ingestion completed!');

  // Test search functionality
  console.log('\n🔍 Testing search for "almond al"...');
  const searchResponse = await fetch(`${LANCEDB_API_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'almond al',
      limit: 10
    })
  });

  if (searchResponse.ok) {
    const searchResults = await searchResponse.json();
    console.log(`📋 Search returned ${searchResults.results.length} results`);

    // Check if "All Purpose Bees" content appears
    const allPurposeBeesResults = searchResults.results.filter((r: any) =>
      r.id?.includes('all-purpose-bees') ||
      r.title?.toLowerCase().includes('all purpose bees')
    );

    if (allPurposeBeesResults.length > 0) {
      console.log('✅ "All Purpose Bees" content found in search results!');
      console.log('📋 All Purpose Bees results:');
      allPurposeBeesResults.forEach((r: any, i: number) => {
        console.log(`  ${i + 1}. ${r.title} (score: ${r.score})`);
      });
    } else {
      console.log('❌ "All Purpose Bees" content NOT found in search results');
      console.log('💡 This indicates the vector search issue persists');
    }
  } else {
    console.log('❌ Search test failed');
  }
}

// Run the ingestion
ingestAllPurposeBees().catch(console.error);
