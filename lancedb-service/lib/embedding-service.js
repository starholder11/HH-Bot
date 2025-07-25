const OpenAI = require('openai');
const crypto = require('crypto');
const logger = require('./logger');

class EmbeddingService {
  constructor(options = {}) {
    this.openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || 'text-embedding-3-small';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second
    this.batchSize = options.batchSize || 100; // Max embeddings per batch
    this.cache = new Map(); // Simple in-memory cache
    this.maxCacheSize = options.maxCacheSize || 1000;
    this.openai = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key is required');
      }

      if (this.openaiApiKey && this.openaiApiKey.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(this.openaiApiKey);
          // Accept common patterns {"OPENAI_API_KEY":"sk-..."} or {"openai":"sk-..."}
          this.openaiApiKey = parsed.OPENAI_API_KEY || parsed.openai || parsed.api_key || Object.values(parsed)[0];
        } catch (e) {
          // leave as-is; will fail later and we can see the raw value
        }
      }
      logger.info(`🔑 OpenAI key length: ${this.openaiApiKey ? this.openaiApiKey.length : 'undefined'}`);

      this.openai = new OpenAI({
        apiKey: this.openaiApiKey,
      });

      // Test the connection
      await this.testConnection();

      this.initialized = true;
      logger.info('Embedding service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize embedding service:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      // Test with a simple embedding request
      const testResponse = await this.openai.embeddings.create({
        model: this.model,
        input: 'test connection',
      });

      if (!testResponse.data || !testResponse.data[0] || !testResponse.data[0].embedding) {
        throw new Error('Invalid response from OpenAI API');
      }

      logger.debug('OpenAI API connection test successful');
      return true;

    } catch (error) {
      logger.error('OpenAI API connection test failed:', error);
      throw error;
    }
  }

  async generateEmbedding(text, options = {}) {
    if (!this.initialized) {
      throw new Error('Embedding service not initialized');
    }

    try {
      // Validate input
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Text input must be a non-empty string');
      }

      // Clean and prepare text
      const cleanText = this.preprocessText(text);

      // Check cache first
      const cacheKey = this.generateCacheKey(cleanText);
      if (this.cache.has(cacheKey)) {
        logger.debug('Returning cached embedding');
        return this.cache.get(cacheKey);
      }

      // Generate embedding with retries
      const embedding = await this.generateEmbeddingWithRetry(cleanText, options);

      // Cache the result
      this.cacheEmbedding(cacheKey, embedding);

      return embedding;

    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  async generateEmbeddingWithRetry(text, options = {}, attempt = 1) {
    try {
      const response = await this.openai.embeddings.create({
        model: options.model || this.model,
        input: text,
        encoding_format: 'float',
      });

      if (!response.data || !response.data[0] || !response.data[0].embedding) {
        throw new Error('Invalid response from OpenAI API');
      }

      const embedding = response.data[0].embedding;

      // Validate embedding
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding format');
      }

      logger.debug(`Generated embedding with ${embedding.length} dimensions`);
      return embedding;

    } catch (error) {
      if (attempt < this.maxRetries && this.isRetryableError(error)) {
        logger.warn(`Embedding generation attempt ${attempt} failed, retrying:`, error.message);

        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);

        return this.generateEmbeddingWithRetry(text, options, attempt + 1);
      }

      throw error;
    }
  }

  async generateEmbeddingsBatch(texts, options = {}) {
    if (!this.initialized) {
      throw new Error('Embedding service not initialized');
    }

    try {
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts must be a non-empty array');
      }

      const results = [];

      // Process in batches
      for (let i = 0; i < texts.length; i += this.batchSize) {
        const batch = texts.slice(i, i + this.batchSize);
        const batchResults = await this.processBatch(batch, options);
        results.push(...batchResults);

        // Small delay between batches to respect rate limits
        if (i + this.batchSize < texts.length) {
          await this.sleep(100);
        }
      }

      return results;

    } catch (error) {
      logger.error('Failed to generate batch embeddings:', error);
      throw error;
    }
  }

  async processBatch(texts, options = {}) {
    try {
      // Clean texts
      const cleanTexts = texts.map(text => this.preprocessText(text));

      // Check cache for existing embeddings
      const embeddings = [];
      const uncachedTexts = [];
      const uncachedIndices = [];

      for (let i = 0; i < cleanTexts.length; i++) {
        const cacheKey = this.generateCacheKey(cleanTexts[i]);
        if (this.cache.has(cacheKey)) {
          embeddings[i] = this.cache.get(cacheKey);
        } else {
          uncachedTexts.push(cleanTexts[i]);
          uncachedIndices.push(i);
        }
      }

      // Generate embeddings for uncached texts
      if (uncachedTexts.length > 0) {
        const response = await this.openai.embeddings.create({
          model: options.model || this.model,
          input: uncachedTexts,
          encoding_format: 'float',
        });

        if (!response.data || response.data.length !== uncachedTexts.length) {
          throw new Error('Invalid batch response from OpenAI API');
        }

        // Store results and cache them
        for (let i = 0; i < response.data.length; i++) {
          const embedding = response.data[i].embedding;
          const originalIndex = uncachedIndices[i];
          const cacheKey = this.generateCacheKey(uncachedTexts[i]);

          embeddings[originalIndex] = embedding;
          this.cacheEmbedding(cacheKey, embedding);
        }
      }

      logger.debug(`Generated ${uncachedTexts.length} new embeddings, ${texts.length - uncachedTexts.length} from cache`);
      return embeddings;

    } catch (error) {
      logger.error('Failed to process batch:', error);
      throw error;
    }
  }

  preprocessText(text) {
    // Clean and prepare text for embedding
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .substring(0, 8000); // Limit length (OpenAI has token limits)
  }

  generateHash(content) {
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
  }

  generateCacheKey(text) {
    return this.generateHash(`${this.model}:${text}`);
  }

  cacheEmbedding(key, embedding) {
    // Simple LRU-like cache management
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, embedding);
  }

  isRetryableError(error) {
    // Check if error is retryable (rate limits, temporary failures)
    if (error.status) {
      return error.status === 429 || // Rate limit
             error.status === 502 || // Bad gateway
             error.status === 503 || // Service unavailable
             error.status === 504;   // Gateway timeout
    }

    // Network errors are generally retryable
    return error.code === 'ENOTFOUND' ||
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods for different content types
  async generateTextEmbedding(content) {
    return this.generateEmbedding(content);
  }

  async generateImageEmbedding(imageMetadata) {
    // Combine image metadata into searchable text
    const textParts = [];

    if (imageMetadata.ai_labels) {
      if (imageMetadata.ai_labels.scenes) {
        textParts.push(...imageMetadata.ai_labels.scenes);
      }
      if (imageMetadata.ai_labels.objects) {
        textParts.push(...imageMetadata.ai_labels.objects);
      }
      if (imageMetadata.ai_labels.style) {
        textParts.push(...imageMetadata.ai_labels.style);
      }
      if (imageMetadata.ai_labels.mood) {
        textParts.push(...imageMetadata.ai_labels.mood);
      }
      if (imageMetadata.ai_labels.themes) {
        textParts.push(...imageMetadata.ai_labels.themes);
      }
    }

    if (imageMetadata.manual_labels) {
      if (imageMetadata.manual_labels.custom_tags) {
        textParts.push(...imageMetadata.manual_labels.custom_tags);
      }
      if (imageMetadata.manual_labels.description) {
        textParts.push(imageMetadata.manual_labels.description);
      }
    }

    if (imageMetadata.title) {
      textParts.push(imageMetadata.title);
    }

    const combinedText = textParts.join(' ');

    if (combinedText.trim().length === 0) {
      throw new Error('No text content found in image metadata for embedding generation');
    }

    return this.generateEmbedding(combinedText);
  }

  async generateVideoEmbedding(videoMetadata) {
    // Combine video metadata into searchable text
    const textParts = [];

    // Video-level description
    if (videoMetadata.video_description) {
      textParts.push(videoMetadata.video_description);
    }

    // Keyframe descriptions
    if (videoMetadata.keyframes && Array.isArray(videoMetadata.keyframes)) {
      videoMetadata.keyframes.forEach(keyframe => {
        if (keyframe.description) {
          textParts.push(keyframe.description);
        }
      });
    }

    // Tags and themes
    if (videoMetadata.tags) {
      textParts.push(...videoMetadata.tags);
    }

    if (videoMetadata.themes) {
      textParts.push(...videoMetadata.themes);
    }

    if (videoMetadata.title) {
      textParts.push(videoMetadata.title);
    }

    const combinedText = textParts.join(' ');

    if (combinedText.trim().length === 0) {
      throw new Error('No text content found in video metadata for embedding generation');
    }

    return this.generateEmbedding(combinedText);
  }

  async generateAudioEmbedding(audioMetadata) {
    // Combine audio metadata into searchable text
    const textParts = [];

    if (audioMetadata.lyrics) {
      textParts.push(audioMetadata.lyrics);
    }

    if (audioMetadata.prompt) {
      textParts.push(audioMetadata.prompt);
    }

    if (audioMetadata.manual_labels) {
      if (audioMetadata.manual_labels.themes) {
        textParts.push(...audioMetadata.manual_labels.themes);
      }
      if (audioMetadata.manual_labels.mood) {
        textParts.push(...audioMetadata.manual_labels.mood);
      }
      if (audioMetadata.manual_labels.genre) {
        textParts.push(...audioMetadata.manual_labels.genre);
      }
    }

    if (audioMetadata.title) {
      textParts.push(audioMetadata.title);
    }

    const combinedText = textParts.join(' ');

    if (combinedText.trim().length === 0) {
      throw new Error('No text content found in audio metadata for embedding generation');
    }

    return this.generateEmbedding(combinedText);
  }

  // Cache management
  clearCache() {
    this.cache.clear();
    logger.info('Embedding cache cleared');
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0
    };
  }

  // Resource cleanup
  async close() {
    this.clearCache();
    this.initialized = false;
    logger.info('Embedding service closed');
  }
}

module.exports = EmbeddingService;
