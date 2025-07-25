import { OpenAI } from 'openai';
import matter from 'gray-matter';

// LanceDB client configuration
// Default to the new production load-balancer URL if the env var isn't provided
const LANCEDB_API_URL =
  process.env.LANCEDB_API_URL ||
  'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

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

interface MediaAsset {
  id: string;
  filename: string;
  title: string;
  s3_url: string;
  cloudflare_url: string;
  media_type: 'image' | 'video' | 'audio' | 'keyframe_still';
  ai_labels: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
  };
  manual_labels: any;
  metadata: any;
  lyrics?: string;
  prompt?: string;
  keyframe_stills?: any[];
  created_at: string;
}

interface TextContent {
  slug: string;
  title: string;
  description?: string;
  content: string;
  frontmatter: any;
  file_path: string;
}

export class LanceDBIngestionService {
  private openai: OpenAI | null = null;

  constructor() {
    // Only initialize OpenAI client if an API key is present
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  // Generate embeddings using OpenAI - ROBUST ERROR HANDLING
  async generateEmbedding(text: string): Promise<number[]> {
    // Validate inputs first
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Invalid text input for embedding generation');
    }

    // Ensure the OpenAI client is available
    if (!this.openai) {
      const keyExists = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
      throw new Error(`OpenAI client not initialized. API key ${keyExists ? 'exists but failed to initialize' : 'is missing'}. Cannot generate embeddings.`);
    }

    // Validate text length (OpenAI has limits)
    const maxTokens = 8000; // Conservative estimate for text-embedding-3-small
    if (text.length > maxTokens * 4) { // Rough chars-to-tokens estimate
      console.warn(`Text too long for embedding (${text.length} chars), truncating...`);
      text = text.substring(0, maxTokens * 4);
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.trim(),
      });

      if (!response.data || !response.data[0] || !response.data[0].embedding) {
        throw new Error('Invalid response from OpenAI embeddings API');
      }

      const embedding = response.data[0].embedding;

      // Validate embedding dimensions
      if (!Array.isArray(embedding) || embedding.length !== 1536) {
        throw new Error(`Invalid embedding dimensions: expected 1536, got ${embedding?.length || 'undefined'}`);
      }

      return embedding;
    } catch (error: any) {
      // Enhanced error reporting
      if (error.code === 'insufficient_quota') {
        throw new Error('OpenAI API quota exceeded. Check your billing.');
      } else if (error.code === 'invalid_api_key') {
        throw new Error('OpenAI API key is invalid. Check your credentials.');
      } else if (error.code === 'rate_limit_exceeded') {
        throw new Error('OpenAI API rate limit exceeded. Try again later.');
      }

      console.error('Error generating embedding:', {
        error: error.message,
        code: error.code,
        type: error.type,
        textLength: text?.length || 0
      });
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  // Send record to LanceDB
  async addToLanceDB(record: LanceDBRecord): Promise<void> {
    try {
      // Transform our record format to match the service API
      const apiRecord = {
        id: record.id,
        content_type: record.content_type, // Keep original content type (media, text, etc.)
        title: record.title,
        content_text: record.combined_text,
        references: {
          s3_url: record.s3_url,
          cloudflare_url: record.cloudflare_url,
        },
        metadata: record.metadata,
      };

      const response = await fetch(`${LANCEDB_API_URL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiRecord),
      });

      if (!response.ok) {
        throw new Error(`LanceDB API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error adding to LanceDB:', error);
      throw error;
    }
  }

  // Demo: Process a sample media asset to prove extraction works
  async processSampleMediaAsset(): Promise<void> {
    console.log('🎵 Demo: Processing sample audio asset...');

    // Sample audio asset with rich metadata (like what we'd get from S3)
    const sampleAudioAsset: MediaAsset = {
      id: 'demo_audio_001',
      filename: 'sample-song.mp3',
      title: 'Demo Electronic Music Track',
      s3_url: 'https://s3.amazonaws.com/demo/sample.mp3',
      cloudflare_url: 'https://cdn.demo.com/sample.mp3',
      media_type: 'audio',
      ai_labels: {
        scenes: [],
        objects: [],
        style: ['Electronic', 'IDM', 'Experimental'],
        mood: ['Uplifting', 'Dreamy', 'Energetic'],
        themes: ['Technology', 'Future', 'Creativity'],
      },
      manual_labels: {
        primary_genre: 'Electronic',
        energy_level: 7,
        emotional_intensity: 6,
        vocals: 'instrumental',
        language: 'english'
      },
      metadata: {
        duration: 245,
        format: 'mp3',
        bitrate: 320
      },
      lyrics: 'Instrumental track with electronic elements and dreamy synthesizers',
      prompt: 'Electronic IDM track with uplifting energy and experimental elements',
      created_at: new Date().toISOString(),
    };

    const record = await this.processMediaAsset(sampleAudioAsset);
    await this.addToLanceDB(record);
    console.log('✅ Demo audio asset processed and added to LanceDB');
  }

  // Demo: Process a sample image asset
  async processSampleImageAsset(): Promise<void> {
    console.log('🖼️ Demo: Processing sample image asset...');

    const sampleImageAsset: MediaAsset = {
      id: 'demo_image_001',
      filename: 'sample-artwork.jpg',
      title: 'Digital Art Composition',
      s3_url: 'https://s3.amazonaws.com/demo/artwork.jpg',
      cloudflare_url: 'https://cdn.demo.com/artwork.jpg',
      media_type: 'image',
      ai_labels: {
        scenes: ['digital workspace', 'creative studio'],
        objects: ['computer', 'artwork', 'digital canvas'],
        style: ['digital art', 'modern', 'colorful', 'abstract'],
        mood: ['creative', 'inspiring', 'vibrant'],
        themes: ['creativity', 'digital art', 'innovation'],
      },
      manual_labels: {
        custom_tags: ['digital', 'portfolio', 'showcase']
      },
      metadata: {
        width: 1920,
        height: 1080,
        format: 'jpeg',
        color_space: 'sRGB'
      },
      created_at: new Date().toISOString(),
    };

    const record = await this.processMediaAsset(sampleImageAsset);
    await this.addToLanceDB(record);
    console.log('✅ Demo image asset processed and added to LanceDB');
  }

  // Demo: Process sample text content
  async processSampleTextContent(): Promise<void> {
    console.log('📄 Demo: Processing sample text content...');

    const sampleTextContent: TextContent = {
      slug: 'demo-timeline-entry',
      title: 'Demo Timeline Entry: Future of AI',
      description: 'A demonstration of timeline content with AI themes',
      content: 'This is a demo timeline entry about the future of artificial intelligence, machine learning, and creative technology. It explores themes of innovation, creativity, and the intersection of technology with human expression.',
      frontmatter: {
        title: 'Demo Timeline Entry: Future of AI',
        date: new Date().toISOString(),
        tags: ['AI', 'technology', 'future', 'creativity']
      },
      file_path: 'demo/timeline/future-ai.mdx'
    };

    const record = await this.processTextContent(sampleTextContent);
    await this.addToLanceDB(record);
    console.log('✅ Demo text content processed and added to LanceDB');
  }

  // Process media asset for LanceDB - EXTRACT ALL NESTED ANALYSIS DATA
  async processMediaAsset(asset: MediaAsset): Promise<LanceDBRecord> {
    // Combine all text for embedding - GET EVERYTHING
    const textParts = [
      asset.title,
      asset.filename,
      ...asset.ai_labels?.scenes || [],
      ...asset.ai_labels?.objects || [],
      ...asset.ai_labels?.style || [],
      ...asset.ai_labels?.mood || [],
      ...asset.ai_labels?.themes || [],
    ];

    // Add lyrics if audio
    if (asset.lyrics) {
      textParts.push(asset.lyrics);
    }

    // Add prompt if available
    if (asset.prompt) {
      textParts.push(asset.prompt);
    }

    // For images: Extract sophisticated GPT-4V analysis data
    if (asset.media_type === 'image' && asset.ai_labels) {
      const imageLabels = asset.ai_labels as any;

      // Extract confidence-scored analysis if available
      if (imageLabels.confidence_scores) {
        const confidenceThreshold = 0.7;

        Object.keys(imageLabels.confidence_scores).forEach(category => {
          const scores = imageLabels.confidence_scores[category];
          const labels = imageLabels[category];

          if (Array.isArray(scores) && Array.isArray(labels)) {
            scores.forEach((score: number, index: number) => {
              if (score >= confidenceThreshold && labels[index]) {
                textParts.push(`high-confidence-${category}: ${labels[index]}`);
              }
            });
          }
        });
      }
    }

    // Remove empty strings and duplicates, then join
    const filteredParts = textParts.filter(Boolean);
    const uniqueTextParts = Array.from(new Set(filteredParts));
    const combinedText = uniqueTextParts.join(' ');

    // Generate embedding with validation
    if (!combinedText.trim()) {
      throw new Error(`No content to embed for asset ${asset.id} - this suggests missing metadata`);
    }

    const embedding = await this.generateEmbedding(combinedText);

    return {
      id: asset.id,
      content_type: 'media',
      title: asset.title,
      description: `${asset.media_type}: ${asset.filename}`,
      combined_text: combinedText,
      embedding,
      metadata: {
        media_type: asset.media_type,
        ai_labels: asset.ai_labels,
        manual_labels: asset.manual_labels,
        file_metadata: asset.metadata,
        analysis_completeness: {
          has_confidence_scores: asset.media_type === 'image' && !!((asset.ai_labels as any)?.confidence_scores),
          unique_terms_extracted: uniqueTextParts.length,
          ai_labels_richness: {
            scenes_count: asset.ai_labels?.scenes?.length || 0,
            objects_count: asset.ai_labels?.objects?.length || 0,
            style_count: asset.ai_labels?.style?.length || 0,
            mood_count: asset.ai_labels?.mood?.length || 0,
            themes_count: asset.ai_labels?.themes?.length || 0,
          }
        }
      },
      s3_url: asset.s3_url,
      cloudflare_url: asset.cloudflare_url,
      created_at: asset.created_at,
      updated_at: new Date().toISOString(),
    };
  }

  // Process text content for LanceDB
  async processTextContent(content: TextContent): Promise<LanceDBRecord> {
    const textParts = [
      content.title,
      content.description || '',
      content.content,
    ];

    if (content.frontmatter.tags) {
      textParts.push(...content.frontmatter.tags);
    }

    const combinedText = textParts.filter(Boolean).join(' ');
    const embedding = await this.generateEmbedding(combinedText);

    return {
      id: `text_${content.slug}`,
      content_type: 'text',
      title: content.title,
      description: content.description || '',
      combined_text: combinedText,
      embedding,
      metadata: {
        slug: content.slug,
        frontmatter: content.frontmatter,
        file_path: content.file_path,
        word_count: content.content.split(' ').length,
      },
      url: `/timeline/${content.slug}`,
      created_at: content.frontmatter.date || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // Search function for unified queries
  async search(query: string, limit: number = 10): Promise<any[]> {
    try {
      const response = await fetch(`${LANCEDB_API_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit,
        }),
      });

      if (!response.ok) {
        throw new Error(`Search API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error searching LanceDB:', error);
      throw error;
    }
  }

  // Demo ingestion process
  async runDemo(): Promise<void> {
    console.log('🚀 Starting DEMO LanceDB ingestion...');

    try {
      // Process sample content to prove extraction works
      await this.processSampleTextContent();
      await this.processSampleMediaAsset();
      await this.processSampleImageAsset();

      console.log('🎉 Demo ingestion complete!');

      // Test search functionality
      console.log('🔍 Testing search with demo content...');
      const searchResults = await this.search('electronic music creativity AI', 5);
      console.log('✅ Search results:', JSON.stringify(searchResults, null, 2));

    } catch (error) {
      console.error('💥 Demo failed:', error);
      throw error;
    }
  }
}

export default LanceDBIngestionService;
