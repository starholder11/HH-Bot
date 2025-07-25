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
      } catch (error) {
        // Table doesn't exist, create it with proper Arrow schema
        const schema = new Schema([
          new Field('id', new Utf8()),
          new Field('content_type', new Utf8()),
          new Field('title', new Utf8()),
          new Field('description', new Utf8()),
          new Field('combined_text', new Utf8()),
          new Field('embedding', new FixedSizeList(1536, new Float32())), // OpenAI embeddings are 1536 dimensions
          new Field('metadata', new Utf8()), // JSON string
          new Field('created_at', new Utf8()),
          new Field('updated_at', new Utf8())
        ]);

        this.table = await this.db.createTable('content', [], schema);
        logger.info('🆕 Created new content table with schema');
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
      // Prepare the record for LanceDB
      const lanceRecord = {
        id: record.id,
        content_type: record.content_type,
        title: record.title || '',
        description: record.description || '',
        combined_text: record.combined_text || record.content_text || '',
        embedding: record.embedding,
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
      const lanceRecords = records.map(record => ({
        id: record.id,
        content_type: record.content_type,
        title: record.title || '',
        description: record.description || '',
        combined_text: record.combined_text || record.content_text || '',
        embedding: record.embedding,
        metadata: JSON.stringify(record.metadata || {}),
        created_at: record.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      await this.table.add(lanceRecords);
      logger.info(`✅ Added ${records.length} records to LanceDB`);

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
      // Perform vector search
      const results = await this.table
        .search(queryEmbedding)
        .limit(limit)
        .toArray();

      // Transform results back to our format
      const transformedResults = results.map(result => ({
        id: result.id,
        content_type: result.content_type,
        title: result.title,
        description: result.description,
        combined_text: result.combined_text,
        score: result._distance ? (1 - result._distance) : 0.5, // Convert distance to similarity score
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
      const results = await this.table
        .search([0]) // Dummy vector for filter-only query
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
}

module.exports = LanceDBManager;
