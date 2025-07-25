import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';
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
  private openai?: OpenAI;

  constructor() {
    // Only initialize OpenAI client if an API key is present.  This prevents
    // errors in environments (e.g. Vercel preview/prod) where the key has not
    // been configured but we still want read-only search functionality that
    // relies on the remote LanceDB service to generate embeddings.
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  // Generate embeddings using OpenAI
  async generateEmbedding(text: string): Promise<number[]> {
    // Ensure the OpenAI client is available
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY is missing – cannot generate embeddings');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  // Send record to LanceDB
  async addToLanceDB(record: LanceDBRecord): Promise<void> {
    try {
      // Transform our record format to match the service API
      const apiRecord = {
        id: record.id,
        content_type: record.content_type === 'media' ? 'audio' : record.content_type, // Map 'media' to 'audio'
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

  // Process media asset for LanceDB
  async processMediaAsset(asset: MediaAsset): Promise<LanceDBRecord> {
    // Combine all text for embedding
    const textParts = [
      asset.title,
      asset.filename,
      ...asset.ai_labels.scenes,
      ...asset.ai_labels.objects,
      ...asset.ai_labels.style,
      ...asset.ai_labels.mood,
      ...asset.ai_labels.themes,
    ];

    // Add lyrics if audio
    if (asset.lyrics) {
      textParts.push(asset.lyrics);
    }

    // Add prompt if available
    if (asset.prompt) {
      textParts.push(asset.prompt);
    }

    // Add keyframe descriptions if video
    if (asset.keyframe_stills) {
      asset.keyframe_stills.forEach(keyframe => {
        if (keyframe.ai_labels) {
          textParts.push(
            ...keyframe.ai_labels.scenes || [],
            ...keyframe.ai_labels.objects || [],
            ...keyframe.ai_labels.style || [],
            ...keyframe.ai_labels.mood || [],
            ...keyframe.ai_labels.themes || []
          );
        }
      });
    }

    const combinedText = textParts.filter(Boolean).join(' ');
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
        keyframe_count: asset.keyframe_stills?.length || 0,
      },
      s3_url: asset.s3_url,
      cloudflare_url: asset.cloudflare_url,
      created_at: asset.created_at,
      updated_at: new Date().toISOString(),
    };
  }

  // Process text content for LanceDB
  async processTextContent(content: TextContent): Promise<LanceDBRecord> {
    // Combine frontmatter and content for embedding
    const textParts = [
      content.title,
      content.description || '',
      content.content,
    ];

    // Add frontmatter fields
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

    // Load all media assets from the media storage system
  async loadMediaAssets(): Promise<MediaAsset[]> {
    const assets: MediaAsset[] = [];

    try {
      console.log('📁 Loading media assets from storage...');

      // Import storage functions
      const { listMediaAssets } = await import('./media-storage');
      const { listSongs } = await import('./song-storage');

      // Load all media assets (images, videos)
      const mediaResult = await listMediaAssets(undefined, {
        loadAll: true,
        excludeKeyframes: true // Avoid duplicate keyframe assets
      });

      // Filter out keyframe assets to avoid duplicates
      const filteredAssets = mediaResult.assets.filter(asset => asset.media_type !== 'keyframe_still');
      console.log(`✅ Loaded ${filteredAssets.length} media assets (${mediaResult.assets.length - filteredAssets.length} keyframes excluded)`);
      assets.push(...filteredAssets);

      // Load all songs/audio separately
      const songs = await listSongs();
      console.log(`✅ Loaded ${songs.length} songs`);

      // Convert songs to MediaAsset format
      const convertedSongs: MediaAsset[] = songs.map(song => ({
        id: song.id,
        filename: song.filename,
        title: song.title || song.filename,
        s3_url: song.s3_url,
        cloudflare_url: song.cloudflare_url,
        media_type: 'audio' as const,
        ai_labels: {
          scenes: [],
          objects: [],
          style: song.auto_analysis?.style_tags || [],
          mood: song.manual_labels?.mood || song.auto_analysis?.mood_tags || [],
          themes: song.manual_labels?.themes || song.auto_analysis?.theme_tags || [],
        },
        manual_labels: song.manual_labels || {},
        metadata: {
          duration: song.metadata?.duration,
          file_size: song.metadata?.file_size,
          format: song.metadata?.format,
          genre: song.manual_labels?.primary_genre,
          energy_level: song.manual_labels?.energy_level,
          tempo: song.manual_labels?.tempo,
          vocals: song.manual_labels?.vocals,
          language: song.manual_labels?.language,
        },
        lyrics: song.lyrics,
        prompt: song.prompt,
        created_at: song.created_at,
      }));

      assets.push(...convertedSongs);

      console.log(`🎵 Total assets loaded: ${assets.length}`);
      return assets;

    } catch (error) {
      console.error('❌ Error loading media assets:', error);
      return [];
    }
  }

  // Load all text content from the content directory
  async loadTextContent(): Promise<TextContent[]> {
    const contentDir = path.join(process.cwd(), 'content');
    const contents: TextContent[] = [];

    async function processDirectory(dir: string, baseDir: string = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await processDirectory(fullPath, path.join(baseDir, entry.name));
        } else if (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) {
          try {
            const fileContent = await fs.readFile(fullPath, 'utf-8');
            const { data: frontmatter, content } = matter(fileContent);

            const slug = baseDir ?
              `${baseDir}/${entry.name.replace(/\.(mdx?|md)$/, '')}` :
              entry.name.replace(/\.(mdx?|md)$/, '');

            contents.push({
              slug: slug.replace(/^\//, ''), // Remove leading slash
              title: frontmatter.title || slug,
              description: frontmatter.description,
              content,
              frontmatter,
              file_path: fullPath,
            });
          } catch (error) {
            console.error(`Error processing ${fullPath}:`, error);
          }
        }
      }
    }

    await processDirectory(contentDir);
    return contents;
  }

  // Full ingestion process
  async ingestAllContent(): Promise<void> {
    console.log('🚀 Starting LanceDB content ingestion...');

    try {
      // Load and process text content
      console.log('📄 Processing text content...');
      const textContents = await this.loadTextContent();
      console.log(`Found ${textContents.length} text files`);

      for (const content of textContents) {
        try {
          const record = await this.processTextContent(content);
          await this.addToLanceDB(record);
          console.log(`✅ Added text: ${content.title}`);
        } catch (error) {
          console.error(`❌ Failed to process text ${content.title}:`, error);
        }
      }

      // Load and process media assets
      console.log('🎬 Processing media assets...');
      const mediaAssets = await this.loadMediaAssets();
      console.log(`Found ${mediaAssets.length} media assets`);

      for (const asset of mediaAssets) {
        try {
          const record = await this.processMediaAsset(asset);
          await this.addToLanceDB(record);
          console.log(`✅ Added media: ${asset.title} (${asset.media_type})`);
        } catch (error) {
          console.error(`❌ Failed to process media ${asset.title}:`, error);
        }
      }

      console.log('🎉 Ingestion complete!');

    } catch (error) {
      console.error('💥 Ingestion failed:', error);
      throw error;
    }
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
}

export default LanceDBIngestionService;
