const fs = require('fs');
const path = require('path');
const { connect } = require('@lancedb/lancedb');
const { Schema, Field, Utf8, Float32, FixedSizeList } = require('apache-arrow');
const logger = require('./logger');

class LanceDBManager {
  constructor(dbPath) {
    this.dbPath = dbPath || process.env.LANCEDB_PATH || '/tmp/lancedb';
    this.db = null;
    this.table = null;
    this.isInitialized = false;

    logger.info(`🚀 LanceDBManager initialized with path: ${this.dbPath}`);
  }

  async initialize() {
    try {
      // Ensure the directory exists
      if (!fs.existsSync(this.dbPath)) {
        fs.mkdirSync(this.dbPath, { recursive: true });
        logger.info(`📁 Created LanceDB directory: ${this.dbPath}`);
      }

      // Connect to LanceDB
      this.db = await connect(this.dbPath);
      logger.info(`🔗 Connected to LanceDB at: ${this.dbPath}`);

      // Create or open the table
      await this.ensureTable();

      this.isInitialized = true;
      logger.info('✅ LanceDB initialized successfully');

    } catch (error) {
      logger.error('❌ Failed to initialize LanceDB:', error);
      throw error;
    }
  }

  async ensureTable() {
    try {
      // Try to open existing table
      try {
        this.table = await this.db.openTable('content');
        logger.info('📋 Opened existing content table');

        // Test if the table has the correct schema by trying a simple search
        try {
          const testEmbedding = new Array(1536).fill(0);
          await this.table.search(testEmbedding, { column: 'embedding' }).limit(1).toArray();
          logger.info('✅ Existing table schema is correct');
        } catch (searchError) {
          logger.warn('⚠️ Existing table has wrong schema, recreating...');
          await this.recreateTable();
        }
      } catch (error) {
        // Table doesn't exist, create it with proper vector schema
        // CRITICAL FIX: Use proper vector column type instead of FixedSizeList
        const schema = new Schema([
          new Field('id', new Utf8(), false),
          new Field('content_type', new Utf8(), false),
          new Field('title', new Utf8(), false),
          new Field('description', new Utf8(), false),
          new Field('combined_text', new Utf8(), false),
          // FIXED: Use proper vector column type for LanceDB vector search
          new Field('embedding', new FixedSizeList(1536, new Field('item', new Float32(), false)), false),
          new Field('metadata', new Utf8(), false),
          new Field('created_at', new Utf8(), false),
          new Field('updated_at', new Utf8(), false)
        ]);

        const sampleData = [{
          id: 'sample',
          content_type: 'text',
          title: 'Sample',
          description: 'Sample record',
          combined_text: 'Sample text',
          embedding: new Array(1536).fill(0),
          metadata: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }];

        this.table = await this.db.createTable('content', sampleData, {
          schema,
          mode: 'overwrite'
        });

        logger.info('🆕 Created new content table with proper schema');
        logger.info('⚠️ Index will be created after sufficient data is populated (>256 rows)');

        // Verify the table has the correct schema
        const tableSchema = await this.table.schema();
        logger.info('📋 Table schema:', JSON.stringify(tableSchema, null, 2));
      }
    } catch (error) {
      logger.error('❌ Failed to ensure table:', error);
      throw error;
    }
  }

  async addRecord(record) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // CRITICAL FIX: Convert embedding to Float32Array for proper vector search
      const embedding = Array.isArray(record.embedding) ? new Float32Array(record.embedding) : record.embedding;

      // Prepare the record for LanceDB
      const lanceRecord = {
        id: record.id,
        content_type: record.content_type,
        title: record.title || '',
        description: record.description || '',
        combined_text: record.combined_text || record.content_text || '',
        embedding: embedding,
        metadata: JSON.stringify(record.metadata || {}),
        created_at: record.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await this.table.add([lanceRecord]);
      logger.info(`✅ Added record: ${record.id}`);

      return { success: true, id: record.id };
    } catch (error) {
      logger.error(`❌ Failed to add record ${record.id}:`, error);
      throw error;
    }
  }

  async addRecords(records) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const lanceRecords = records.map(record => {
        // CRITICAL FIX: Convert embedding to Float32Array for proper vector search
        const embedding = Array.isArray(record.embedding) ? new Float32Array(record.embedding) : record.embedding;

        return {
          id: record.id,
          content_type: record.content_type,
          title: record.title || '',
          description: record.description || '',
          combined_text: record.combined_text || record.content_text || '',
          embedding: embedding,
          metadata: JSON.stringify(record.metadata || {}),
          created_at: record.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      await this.table.add(lanceRecords);
      logger.info(`✅ Added ${records.length} records to LanceDB`);

      // Check if we should create the vector index now
      await this.ensureVectorIndex();

      return { success: true, count: records.length };
    } catch (error) {
      logger.error('❌ Failed to add records:', error);
      throw error;
    }
  }

  async search(queryEmbedding, limit = 10) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info('🔍 Starting vector search...');
      logger.info(`🔍 Query embedding length: ${queryEmbedding.length}`);
      logger.info(`🔍 Limit: ${limit}`);

      // Use vector search with the embedding column
      const results = await this.table
        .search(queryEmbedding)
        .limit(limit)
        .toArray();

      logger.info(`📋 Vector search found ${results.length} results`);

      // Transform results back to our format
      const transformedResults = results.map(result => ({
        id: result.id,
        content_type: result.content_type,
        title: result.title,
        description: result.description,
        combined_text: result.combined_text,
        score: result.score || 0.5, // Use the actual similarity score
        metadata: JSON.parse(result.metadata || '{}'),
        created_at: result.created_at,
        updated_at: result.updated_at
      }));

      logger.info(`🔍 Vector search returned ${transformedResults.length} results`);
      return transformedResults;

    } catch (error) {
      logger.error('❌ Search failed:', error);
      throw error;
    }
  }

  async getRecord(id) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Use a simple filter query instead of vector search
      const results = await this.table
        .scan()
        .where(`id = '${id}'`)
        .limit(1)
        .toArray();

      if (results.length === 0) {
        return null;
      }

      const result = results[0];
      return {
        id: result.id,
        content_type: result.content_type,
        title: result.title,
        description: result.description,
        combined_text: result.combined_text,
        metadata: JSON.parse(result.metadata || '{}'),
        created_at: result.created_at,
        updated_at: result.updated_at
      };

    } catch (error) {
      logger.error(`❌ Failed to get record ${id}:`, error);
      throw error;
    }
  }

  async updateRecord(id, updates) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // LanceDB doesn't support direct updates, so we need to delete and re-add
      const existing = await this.getRecord(id);
      if (!existing) {
        throw new Error(`Record ${id} not found`);
      }

      // Merge updates
      const updatedRecord = {
        ...existing,
        ...updates,
        updated_at: new Date().toISOString()
      };

      // Delete old record
      await this.table.delete(`id = '${id}'`);

      // Add updated record
      await this.addRecord(updatedRecord);

      logger.info(`✅ Updated record: ${id}`);
      return { success: true, id };

    } catch (error) {
      logger.error(`❌ Failed to update record ${id}:`, error);
      throw error;
    }
  }

  async deleteRecord(id) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.table.delete(`id = '${id}'`);
      logger.info(`✅ Deleted record: ${id}`);
      return { success: true, id };

    } catch (error) {
      logger.error(`❌ Failed to delete record ${id}:`, error);
      throw error;
    }
  }

  async recreateTable() {
    logger.info('Attempting to recreate table `content`...');
    try {
      await this.db.dropTable('content');
      logger.info('Dropped existing table `content`.');
    } catch (error) {
      if (!`${error.message}`.includes('does not exist')) {
        logger.error(`Failed to drop table: ${error.message}`);
        throw error;
      }
      logger.info('Table `content` did not exist, skipping drop.');
    }
    await this.ensureTable();
    logger.info('Table `content` recreated successfully.');
  }

    async ensureVectorIndex() {
    logger.info('🔍 Checking if vector index should be created...');
    try {
      // Check if index already exists
      const indices = await this.table.listIndices();
      if (indices.length > 0) {
        logger.info('✅ Vector index already exists');
        return true;
      }

      // Check if we have enough data for index creation
      const rowCount = await this.table.countRows();
      logger.info(`📊 Table has ${rowCount} rows`);

      if (rowCount < 256) {
        logger.info(`⏳ Not enough rows for index creation (${rowCount} < 256). Will create when sufficient data is available.`);
        return false;
      }

      logger.info('🔍 Creating vector index on embedding column...');
      await this.table.createIndex('embedding', { replace: true });
      logger.info('✅ Vector index created successfully');

      // Verify the index was created
      const newIndices = await this.table.listIndices();
      logger.info('📋 Current indices:', newIndices);

      return true;
    } catch (error) {
      logger.error('❌ Failed to create vector index:', error);
      return false;
    }
  }

  async createVectorIndex() {
    return this.ensureVectorIndex();
  }

  async testConnection() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Try to perform a simple query to test the connection
      const count = await this.table.countRows();
      logger.info(`🔗 Connection test successful. Table has ${count} rows.`);

      return {
        success: true,
        message: `Connected to LanceDB. Table has ${count} rows.`,
        rowCount: count
      };

    } catch (error) {
      logger.error('❌ Connection test failed:', error);
      return {
        success: false,
        message: `Connection failed: ${error.message}`
      };
    }
  }

  async getAllRecords() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Get all records from the table
      const results = await this.table
        .search([0]) // Dummy vector for filter-only query
        .limit(10000) // Large limit to get all records
        .toArray();

      // Transform results back to our format
      const transformedResults = results.map(result => ({
        id: result.id,
        content_type: result.content_type,
        title: result.title,
        description: result.description,
        combined_text: result.combined_text,
        score: 0.5, // Default score since we're not doing vector search
        metadata: JSON.parse(result.metadata || '{}'),
        created_at: result.created_at,
        updated_at: result.updated_at
      }));

      logger.info(`📋 Retrieved ${transformedResults.length} total records`);
      return transformedResults;

    } catch (error) {
      logger.error('❌ Failed to get all records:', error);
      throw error;
    }
  }
}

module.exports = LanceDBManager;
