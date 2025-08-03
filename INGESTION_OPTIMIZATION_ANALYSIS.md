# LanceDB Ingestion Performance Analysis & Optimization Plan

## Current Performance Analysis

### 🐛 **Critical Bottlenecks Identified**

#### 1. **Sequential Processing (Major Bottleneck)**
```typescript
// Current approach - SEQUENTIAL
for (const asset of mediaAssets) {
  const record = await ingestionService.processMediaAsset(asset);  // ~2-5s per item
  await ingestionService.addToLanceDB(record);                     // ~0.5s per item
}
```
- **Impact**: 90 minutes for ~6,700 records = ~0.8s per record
- **Root Cause**: No parallelization, each item waits for previous completion

#### 2. **OpenAI API Rate Limits**
```typescript
// Current: 1 embedding call per record
const embedding = await this.generateEmbedding(combinedText);
```
- **Limit**: ~3,000 requests/minute for text-embedding-3-small
- **Current Usage**: ~1 request per record = 6,700 requests total
- **Time**: Should take ~2.5 minutes, not 90 minutes!

#### 3. **Network Round-trips**
```typescript
// Current: 1 HTTP call per record to LanceDB
await fetch(`${LANCEDB_API_URL}/add`, { ... });
```
- **Impact**: 6,700 individual HTTP requests
- **Latency**: ~100-200ms per request to production

#### 4. **No Batch Processing**
- Each embedding: 1 API call
- Each LanceDB insert: 1 HTTP request
- No bulk operations

---

## 🚀 **Optimization Strategy**

### **Phase 1: Parallel Processing (10x Speed Improvement)**

```typescript
// NEW: Parallel processing with concurrency control
class ParallelIngestionService {
  private readonly CONCURRENCY_LIMIT = 50;  // Based on OpenAI rate limits
  private readonly BATCH_SIZE = 100;        // LanceDB batch inserts

  async ingestInParallel(items: any[]) {
    // Process in parallel batches
    const results = [];

    for (let i = 0; i < items.length; i += this.CONCURRENCY_LIMIT) {
      const batch = items.slice(i, i + this.CONCURRENCY_LIMIT);

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(item => this.processItem(item))
      );

      results.push(...batchResults);

      // Batch insert to LanceDB
      await this.batchInsertToLanceDB(batchResults);

      console.log(`✅ Processed ${i + batch.length}/${items.length} items`);
    }

    return results;
  }
}
```

### **Phase 2: OpenAI Batch API (3x Speed + 50% Cost Reduction)**

```typescript
// NEW: Use OpenAI Batch API for embeddings
class BatchEmbeddingService {
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    // Batch up to 2,048 inputs per request
    const BATCH_SIZE = 2000;
    const batches = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      batches.push(texts.slice(i, i + BATCH_SIZE));
    }

    const allEmbeddings = [];

    for (const batch of batches) {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,  // Multiple texts in one call
      });

      allEmbeddings.push(...response.data.map(d => d.embedding));
    }

    return allEmbeddings;
  }
}
```

### **Phase 3: LanceDB Bulk Operations (5x Speed)**

```typescript
// NEW: Bulk inserts to LanceDB
class BulkLanceDBService {
  async bulkInsert(records: LanceDBRecord[]): Promise<void> {
    const BULK_SIZE = 500;

    for (let i = 0; i < records.length; i += BULK_SIZE) {
      const chunk = records.slice(i, i + BULK_SIZE);

      await fetch(`${LANCEDB_API_URL}/bulk-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: chunk })
      });
    }
  }
}
```

---

## 📊 **Expected Performance Improvements**

### **Current Performance**
- **Time**: 90 minutes for 6,700 records
- **Speed**: ~0.8 seconds per record
- **Bottleneck**: Sequential processing

### **Optimized Performance**
- **Phase 1 (Parallel)**: 90min → **9 minutes** (10x improvement)
- **Phase 2 (Batch API)**: 9min → **3 minutes** (3x improvement)
- **Phase 3 (Bulk Insert)**: 3min → **90 seconds** (2x improvement)

### **Final Result: 60x Speed Improvement**
- **From**: 90 minutes
- **To**: 90 seconds
- **Per Record**: 0.8s → 0.013s

---

## 🛠 **Implementation Plan**

### **Step 1: Rate Limiting & Concurrency Control**
```typescript
class RateLimitedProcessor {
  private requestQueue = [];
  private requestsThisMinute = 0;
  private readonly MAX_REQUESTS_PER_MINUTE = 2900; // Conservative limit

  async processWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForRateLimit();
    this.requestsThisMinute++;
    return fn();
  }

  private async waitForRateLimit() {
    if (this.requestsThisMinute >= this.MAX_REQUESTS_PER_MINUTE) {
      console.log('⏳ Rate limit reached, waiting...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      this.requestsThisMinute = 0;
    }
  }
}
```

### **Step 2: Parallel Processing Framework**
```typescript
class HighPerformanceIngestion {
  async ingestWithParallelization(items: ContentItem[]) {
    console.log(`🚀 Starting parallel ingestion of ${items.length} items...`);

    // Step 1: Generate all embeddings in parallel batches
    const embeddings = await this.generateEmbeddingsBulk(
      items.map(item => item.combinedText)
    );

    // Step 2: Create records with embeddings
    const records = items.map((item, i) => ({
      ...item,
      embedding: embeddings[i]
    }));

    // Step 3: Bulk insert to LanceDB
    await this.bulkInsertToLanceDB(records);

    console.log(`✅ Ingestion complete in ${Date.now() - start}ms`);
  }
}
```

### **Step 3: Error Handling & Retry Logic**
```typescript
class RobustIngestion {
  async processWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;

        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        console.log(`⚠️ Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}
```

---

## 🎯 **Implementation Priority**

### **Quick Wins (1-2 hours)**
1. **Parallel Processing**: Implement concurrent embedding generation
2. **Batch Insertions**: Group LanceDB inserts into chunks of 100-500
3. **Progress Tracking**: Real-time progress indicators

### **Medium Term (1 day)**
1. **OpenAI Batch API**: Implement bulk embedding requests
2. **Error Recovery**: Robust retry mechanisms
3. **Memory Optimization**: Stream processing for large datasets

### **Advanced (2-3 days)**
1. **Smart Chunking**: Optimize text chunking for better embeddings
2. **Caching Layer**: Cache embeddings for identical content
3. **Monitoring**: Performance metrics and alerting

---

## 🔧 **Required Changes**

### **LanceDB Service Updates**
```javascript
// Add bulk endpoint to lancedb-service/index.js
app.post('/bulk-add', async (req, res) => {
  const { records } = req.body;

  try {
    // Add all records in one operation
    await table.add(records);
    res.json({ success: true, count: records.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### **New Parallel Ingestion Script**
- `scripts/parallel-ingestion.ts`
- Implements all optimization strategies
- Backwards compatible with existing data format

---

## 📈 **Success Metrics**

- **Ingestion Time**: < 3 minutes for 6,700 records
- **Success Rate**: > 99% successful ingestions
- **Cost Reduction**: 50% lower OpenAI costs via batch API
- **Memory Usage**: < 2GB peak memory usage
- **Error Recovery**: Automatic retry with exponential backoff

This optimization will transform ingestion from a 90-minute bottleneck into a 90-second operation while improving reliability and reducing costs.
