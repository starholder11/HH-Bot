const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
require('dotenv').config();

const logger = require('./lib/logger');
const LanceDBManager = require('./lib/lancedb-manager');
const EmbeddingService = require('./lib/embedding-service');

const app = express();
const PORT = process.env.PORT || 8000;

// Initialize services
let lanceDB;
let embeddingService;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) }}));

// Error handling middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'lancedb-service',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Ready check (for load balancer)
app.get('/ready', async (req, res) => {
  try {
    if (!lanceDB || !embeddingService) {
      return res.status(503).json({
        status: 'not_ready',
        message: 'Services not initialized'
      });
    }

    // Test database connection
    await lanceDB.testConnection();

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Ready check failed:', error);
    res.status(503).json({
      status: 'not_ready',
      error: error.message
    });
  }
});

// Add embedding endpoint
app.post('/embeddings',
  [
    body('id').notEmpty().withMessage('ID is required'),
    body('content_type').isIn(['text', 'image', 'video', 'audio']).withMessage('Invalid content type'),
    body('title').notEmpty().withMessage('Title is required'),
    body('content_text').notEmpty().withMessage('Content text is required'),
    body('references').isObject().withMessage('References must be an object'),
    body('metadata').optional().isObject()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id, content_type, title, content_text, references, metadata = {} } = req.body;

      logger.info(`Adding embedding for ${content_type}: ${id}`);

      // Generate embedding
      const embedding = await embeddingService.generateEmbedding(content_text);

      // Store in LanceDB
      const record = {
        id,
        content_type,
        title,
        combined_text: content_text,
        embedding,
        metadata: {
          ...metadata,
          references,
          content_hash: embeddingService.generateHash(content_text)
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await lanceDB.addRecord(record);

      res.json({
        success: true,
        id,
        message: 'Embedding added successfully'
      });

    } catch (error) {
      logger.error('Error adding embedding:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add embedding',
        details: error.message
      });
    }
  }
);

// Search embeddings endpoint
app.post('/search',
  [
    body('query').notEmpty().withMessage('Query is required'),
    body('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    body('content_types').optional().isArray().withMessage('Content types must be an array'),
    body('threshold').optional().isFloat({ min: 0, max: 1 }).withMessage('Threshold must be between 0 and 1')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        query,
        limit = 10,
        content_types = ['text', 'image', 'video', 'audio'],
        threshold = 0.7
      } = req.body;

      logger.info(`Searching for: "${query}"`);

      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(query);

            // Search in LanceDB
      const results = await lanceDB.search(queryEmbedding, limit);

            // TEMPORARY FIX: LanceDB vector search is broken for non-text content
      // When media content types are requested, return all records and filter
      let allResults = [...results];

      if (content_types.includes('video') || content_types.includes('image') || content_types.includes('audio')) {
        try {
          // Get all records directly from the table
          const allRecords = await lanceDB.table.toArray();
          const mediaRecords = allRecords.filter(record =>
            ['video', 'image', 'audio'].includes(record.content_type) &&
            (content_types.length === 0 || content_types.includes(record.content_type))
          );

          // Transform and add media records
          const transformedMediaRecords = mediaRecords.map(record => ({
            id: record.id,
            content_type: record.content_type,
            title: record.title,
            description: record.description || '',
            score: 0.8, // Default high score for media records
            metadata: JSON.parse(record.metadata || '{}'),
            created_at: record.created_at,
            updated_at: record.updated_at
          }));

          allResults = [...allResults, ...transformedMediaRecords];
          logger.info(`Added ${transformedMediaRecords.length} media records to search results`);
        } catch (error) {
          logger.error('Failed to get media records:', error);
        }
      }

      // Filter by content types if specified
      const filteredResults = content_types.length > 0
        ? allResults.filter(result => content_types.includes(result.content_type))
        : allResults;

      res.json({
        success: true,
        query,
        results: filteredResults.map(result => ({
          id: result.id,
          content_type: result.content_type,
          title: result.title,
          description: result.description || '',
          score: result.score,
          references: result.metadata?.references || {},
          metadata: result.metadata || {}
        })),
        total: filteredResults.length
      });

    } catch (error) {
      logger.error('Error searching embeddings:', error);
      res.status(500).json({
        success: false,
        error: 'Search failed',
        details: error.message
      });
    }
  }
);

// Get embedding by ID
app.get('/embeddings/:id',
  [param('id').notEmpty().withMessage('ID is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;

      const record = await lanceDB.getRecord(id);

      if (!record) {
        return res.status(404).json({
          success: false,
          error: 'Embedding not found'
        });
      }

      res.json({
        success: true,
        record: {
          id: record.id,
          content_type: record.content_type,
          title: record.title,
          references: record.references,
          metadata: record.metadata,
          created_at: record.created_at,
          updated_at: record.updated_at
        }
      });

    } catch (error) {
      logger.error('Error getting embedding:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get embedding',
        details: error.message
      });
    }
  }
);

// Update embedding
app.put('/embeddings/:id',
  [
    param('id').notEmpty().withMessage('ID is required'),
    body('content_text').optional().notEmpty().withMessage('Content text cannot be empty'),
    body('title').optional().notEmpty().withMessage('Title cannot be empty'),
    body('metadata').optional().isObject()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { content_text, title, metadata } = req.body;

      logger.info(`Updating embedding: ${id}`);

      const updateData = {
        updated_at: new Date().toISOString()
      };

      if (content_text) {
        updateData.embedding = await embeddingService.generateEmbedding(content_text);
        updateData.content_hash = embeddingService.generateHash(content_text);
      }

      if (title) updateData.title = title;
      if (metadata) updateData.metadata = metadata;

      await lanceDB.updateRecord(id, updateData);

      res.json({
        success: true,
        id,
        message: 'Embedding updated successfully'
      });

    } catch (error) {
      logger.error('Error updating embedding:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update embedding',
        details: error.message
      });
    }
  }
);

// Delete embedding
app.delete('/embeddings/:id',
  [param('id').notEmpty().withMessage('ID is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;

      logger.info(`Deleting embedding: ${id}`);

      await lanceDB.deleteRecord(id);

      res.json({
        success: true,
        id,
        message: 'Embedding deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting embedding:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete embedding',
        details: error.message
      });
    }
  }
);

// Bulk operations endpoint
app.post('/embeddings/bulk',
  [
    body('operations').isArray().withMessage('Operations must be an array'),
    body('operations.*.action').isIn(['add', 'update', 'delete']).withMessage('Invalid action'),
    body('operations.*.id').notEmpty().withMessage('ID is required for each operation')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { operations } = req.body;

      logger.info(`Processing ${operations.length} bulk operations`);

      const results = [];

      for (const operation of operations) {
        try {
          switch (operation.action) {
            case 'add':
              const embedding = await embeddingService.generateEmbedding(operation.content_text);
              await lanceDB.addRecord({
                ...operation,
                embedding,
                content_hash: embeddingService.generateHash(operation.content_text),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
              break;
            case 'update':
              const updateData = { updated_at: new Date().toISOString() };
              if (operation.content_text) {
                updateData.embedding = await embeddingService.generateEmbedding(operation.content_text);
                updateData.content_hash = embeddingService.generateHash(operation.content_text);
              }
              await lanceDB.updateRecord(operation.id, updateData);
              break;
            case 'delete':
              await lanceDB.deleteRecord(operation.id);
              break;
          }

          results.push({
            id: operation.id,
            action: operation.action,
            success: true
          });

        } catch (error) {
          results.push({
            id: operation.id,
            action: operation.action,
            success: false,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        results,
        total: operations.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });

    } catch (error) {
      logger.error('Error in bulk operations:', error);
      res.status(500).json({
        success: false,
        error: 'Bulk operations failed',
        details: error.message
      });
    }
  }
);

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Initialize services and start server
async function startServer() {
  try {
    logger.info('Initializing LanceDB service...');

    // Initialize LanceDB
    lanceDB = new LanceDBManager(process.env.LANCEDB_PATH || '/mnt/efs/lancedb');
    await lanceDB.initialize();

    // Initialize embedding service
    embeddingService = new EmbeddingService({
      openaiApiKey: process.env.OPENAI_API_KEY,
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
    });
    await embeddingService.initialize();

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`LanceDB service running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  if (lanceDB) {
    await lanceDB.close();
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');

  if (lanceDB) {
    await lanceDB.close();
  }

  process.exit(0);
});

startServer();
