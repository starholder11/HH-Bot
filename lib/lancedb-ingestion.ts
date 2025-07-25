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
        content_type: record.content_type === 'media'
          ? record.metadata?.media_type || 'audio'  // Map 'media' to specific type based on metadata
          : record.content_type,  // Keep 'text' as-is
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
      // Images get detailed GPT-4V analysis that might have additional nested data
      const imageLabels = asset.ai_labels as any;

      // Extract confidence-scored analysis if available
      if (imageLabels.confidence_scores) {
        // High-confidence labels are more valuable for search
        const confidenceThreshold = 0.7;

        Object.keys(imageLabels.confidence_scores).forEach(category => {
          const scores = imageLabels.confidence_scores[category];
          const labels = imageLabels[category];

          if (Array.isArray(scores) && Array.isArray(labels)) {
            // Add high-confidence labels with emphasis
            scores.forEach((score: number, index: number) => {
              if (score >= confidenceThreshold && labels[index]) {
                textParts.push(`high-confidence-${category}: ${labels[index]}`);
              }
            });
          }
        });
      }

      // Extract any additional image analysis metadata
      if (imageLabels.analysis_metadata) {
        const metadata = imageLabels.analysis_metadata;
        if (metadata.technical_quality) textParts.push(...(metadata.technical_quality || []));
        if (metadata.artistic_elements) textParts.push(...(metadata.artistic_elements || []));
        if (metadata.composition) textParts.push(...(metadata.composition || []));
      }
    }

    // For videos: Extract NESTED analysis data that might be missed
    if (asset.media_type === 'video' && asset.ai_labels) {
      // Type assertion to access extended video analysis fields
      const videoLabels = asset.ai_labels as any;

      // Extract overall_analysis if it exists (complex nested video analysis)
      if (videoLabels.overall_analysis) {
        const overall = videoLabels.overall_analysis;
        textParts.push(
          ...(overall.scenes || []),
          ...(overall.objects || []),
          ...(overall.style || []),
          ...(overall.mood || []),
          ...(overall.themes || []),
          ...(overall.technical_quality || [])
        );
      }

      // Extract keyframe_analysis if it exists (frame-by-frame analysis)
      if (videoLabels.keyframe_analysis && Array.isArray(videoLabels.keyframe_analysis)) {
        videoLabels.keyframe_analysis.forEach((frameAnalysis: any) => {
          if (frameAnalysis) {
            textParts.push(
              ...(frameAnalysis.scenes || []),
              ...(frameAnalysis.objects || []),
              ...(frameAnalysis.style || []),
              ...(frameAnalysis.mood || []),
              ...(frameAnalysis.themes || [])
            );
          }
        });
      }
    }

    // Add keyframe still descriptions (individual keyframe AI labels)
    if (asset.keyframe_stills && Array.isArray(asset.keyframe_stills)) {
      asset.keyframe_stills.forEach(keyframe => {
        if (keyframe?.ai_labels) {
          textParts.push(
            ...(keyframe.ai_labels.scenes || []),
            ...(keyframe.ai_labels.objects || []),
            ...(keyframe.ai_labels.style || []),
            ...(keyframe.ai_labels.mood || []),
            ...(keyframe.ai_labels.themes || [])
          );
        }
      });
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
        keyframe_count: asset.keyframe_stills?.length || 0,
        analysis_completeness: {
          // Image-specific analysis tracking
          has_confidence_scores: asset.media_type === 'image' && !!((asset.ai_labels as any)?.confidence_scores),
          confidence_score_count: asset.media_type === 'image' ?
            Object.keys((asset.ai_labels as any)?.confidence_scores || {}).length : 0,

          // Video-specific analysis tracking
          has_overall_analysis: asset.media_type === 'video' && !!((asset.ai_labels as any)?.overall_analysis),
          has_keyframe_analysis: asset.media_type === 'video' && !!((asset.ai_labels as any)?.keyframe_analysis?.length),
          keyframe_stills_count: asset.keyframe_stills?.length || 0,

          // Universal metrics
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

    // Combine cleaned content with metadata for embedding
    const textParts = [
      content.title,
      content.description || '',
      cleanContent,
    ];

    // Add relevant frontmatter fields (but not all tags)
    if (content.frontmatter.tags && Array.isArray(content.frontmatter.tags)) {
      textParts.push(content.frontmatter.tags.join(' '));
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

    // Verify S3 configuration is available
    const hasS3Config = !!(process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET);
    if (!hasS3Config) {
      console.error('❌ S3 configuration is required for media ingestion');
      console.error('   Please set S3_BUCKET_NAME or AWS_S3_BUCKET environment variable');
      throw new Error('S3 configuration is required for media ingestion');
    }

    try {
      console.log('📁 Loading media assets from S3...');

      // Import storage functions
      const { listMediaAssets } = await import('./media-storage');
      const { listSongs } = await import('./song-storage');

      // Load all media assets (images, videos) from S3
      const mediaResult = await listMediaAssets(undefined, {
        loadAll: true,
        excludeKeyframes: true // Avoid duplicate keyframe assets
      });

      // Filter out keyframe assets to avoid duplicates
      const filteredAssets = mediaResult.assets.filter(asset => asset.media_type !== 'keyframe_still');
      console.log(`✅ Loaded ${filteredAssets.length} media assets from S3 (${mediaResult.assets.length - filteredAssets.length} keyframes excluded)`);
      assets.push(...filteredAssets);

      // Load all songs/audio from S3
      const songs = await listSongs();
      console.log(`✅ Loaded ${songs.length} songs from S3`);

      // Convert songs to MediaAsset format - EXTRACT ALL THE RICH METADATA
      const convertedSongs: MediaAsset[] = songs.map(song => {
        // Get AI analysis from the correct nested structure
        const enhancedAnalysis = song.auto_analysis?.enhanced_analysis || {};
        const manualLabels = song.manual_labels || {};

        // Combine all style/mood/theme data from both AI and manual sources
        const allStyles = [
          ...(enhancedAnalysis.styles || []),
          ...(manualLabels.styles || []),
          ...(manualLabels.custom_styles || [])
        ];

        const allMoods = [
          ...(enhancedAnalysis.mood || []),
          ...(manualLabels.mood || []),
          ...(manualLabels.custom_moods || [])
        ];

        const allThemes = [
          ...(enhancedAnalysis.themes || []),
          ...(manualLabels.themes || []),
          ...(manualLabels.custom_themes || [])
        ];

        return {
          id: song.id,
          filename: song.filename,
          title: song.title || song.filename,
          s3_url: song.s3_url,
          cloudflare_url: song.cloudflare_url,
          media_type: 'audio' as const,
          ai_labels: {
            scenes: [], // Audio doesn't have scenes
            objects: [], // Audio doesn't have objects
            style: allStyles,
            mood: allMoods,
            themes: allThemes,
          },
          manual_labels: manualLabels,
          metadata: {
            duration: song.metadata?.duration,
            file_size: song.metadata?.file_size,
            format: song.metadata?.format,
            genre: enhancedAnalysis.primary_genre || manualLabels.primary_genre,
            energy_level: enhancedAnalysis.energy_level || manualLabels.energy_level,
            emotional_intensity: enhancedAnalysis.emotional_intensity || manualLabels.emotional_intensity,
            tempo: manualLabels.tempo,
            vocals: enhancedAnalysis.vocals || manualLabels.vocals,
            language: manualLabels.language,
            explicit: manualLabels.explicit,
            instrumental: manualLabels.instrumental,
            word_count: enhancedAnalysis.word_count || song.auto_analysis?.word_count,
            sentiment_score: enhancedAnalysis.sentiment_score || song.auto_analysis?.sentiment_score,
          },
          lyrics: song.lyrics,
          prompt: song.prompt,
          created_at: song.created_at,
        };
      });

      assets.push(...convertedSongs);

      console.log(`🎵 Total assets loaded from S3: ${assets.length}`);
      return assets;

    } catch (error) {
      console.error('❌ Error loading media assets from S3:', error);
      throw error; // Don't return empty array, fail fast so issues are caught early
    }
  }

  // Load all text content from GitHub repository
  async loadTextContent(): Promise<TextContent[]> {
    const contents: TextContent[] = [];

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO || 'HH-Bot';
    const GITHUB_OWNER = process.env.GITHUB_OWNER || 'starholder11';
    const GITHUB_REF = process.env.GITHUB_REF || 'main';

    if (!GITHUB_TOKEN) {
      console.error('❌ GITHUB_TOKEN environment variable is required');
      throw new Error('GITHUB_TOKEN is required for content ingestion');
    }

    console.log('📄 Loading text content from GitHub repository...');

    try {
      // Fetch timeline entries
      const timelineContents = await this.fetchTimelineEntriesFromGitHub();
      contents.push(...timelineContents);

      // Fetch posts (if they exist)
      const postsContents = await this.fetchPostsFromGitHub();
      contents.push(...postsContents);

      console.log(`✅ Loaded ${contents.length} text files from GitHub`);
      return contents;
    } catch (error) {
      console.error('❌ Error loading text content from GitHub:', error);
      throw error;
    }
  }

  // Fetch timeline entries from GitHub
  private async fetchTimelineEntriesFromGitHub(): Promise<TextContent[]> {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO || 'HH-Bot';
    const GITHUB_OWNER = process.env.GITHUB_OWNER || 'starholder11';
    const GITHUB_REF = process.env.GITHUB_REF || 'main';

    const contents: TextContent[] = [];

    // List timeline directories
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/content/timeline?ref=${GITHUB_REF}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list timeline entries: ${response.status} ${response.statusText}`);
    }

    const directories = await response.json();
    const timelineDirs = directories.filter((item: any) => item.type === 'dir');

    console.log(`📁 Found ${timelineDirs.length} timeline directories`);

    // Process each timeline directory
    for (const dir of timelineDirs) {
      try {
        const slug = dir.name;

        // Fetch index.yaml for metadata
        const yamlPath = `content/timeline/${slug}/index.yaml`;
        const yamlContent = await this.fetchFileContentFromGitHub(yamlPath);

        // Fetch content.mdx for body content
        const contentPath = `content/timeline/${slug}/content.mdx`;
        const mdxContent = await this.fetchFileContentFromGitHub(contentPath);

        if (yamlContent && mdxContent) {
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
        }
      } catch (error) {
        console.warn(`⚠️ Failed to process timeline entry ${dir.name}:`, error);
      }
    }

    return contents;
  }

  // Fetch posts from GitHub
  private async fetchPostsFromGitHub(): Promise<TextContent[]> {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO || 'HH-Bot';
    const GITHUB_OWNER = process.env.GITHUB_OWNER || 'starholder11';
    const GITHUB_REF = process.env.GITHUB_REF || 'main';

    const contents: TextContent[] = [];

    try {
      // List posts directory
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/content/posts?ref=${GITHUB_REF}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        console.log('📝 No posts directory found, skipping...');
        return contents;
      }

      const files = await response.json();
      const mdFiles = files.filter((item: any) =>
        item.type === 'file' && (item.name.endsWith('.md') || item.name.endsWith('.mdx'))
      );

      console.log(`📝 Found ${mdFiles.length} post files`);

      // Process each post file
      for (const file of mdFiles) {
        try {
          const filePath = `content/posts/${file.name}`;
          const fileContent = await this.fetchFileContentFromGitHub(filePath);

          if (fileContent) {
            const { data: frontmatter, content } = matter(fileContent);
            const slug = `posts/${file.name.replace(/\.(mdx?|md)$/, '')}`;

            contents.push({
              slug,
              title: frontmatter.title || slug,
              description: frontmatter.description,
              content,
              frontmatter,
              file_path: filePath,
            });
          }
        } catch (error) {
          console.warn(`⚠️ Failed to process post ${file.name}:`, error);
        }
      }
    } catch (error) {
      console.log('📝 Posts directory not accessible, skipping...');
    }

    return contents;
  }

  // Helper method to fetch file content from GitHub
  private async fetchFileContentFromGitHub(path: string): Promise<string> {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO || 'HH-Bot';
    const GITHUB_OWNER = process.env.GITHUB_OWNER || 'starholder11';
    const GITHUB_REF = process.env.GITHUB_REF || 'main';

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}?ref=${GITHUB_REF}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3.raw',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch file ${path}: ${response.status} ${response.statusText}`);
    }

    return await response.text();
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
