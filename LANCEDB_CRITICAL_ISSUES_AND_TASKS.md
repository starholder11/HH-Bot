# LanceDB Vector Search Service - Critical Issues & Task Requirements

## URGENT PROBLEM STATEMENT

The LanceDB vector search service is in a completely broken state due to persistent schema mismatch errors that cause immediate service crashes. Despite multiple attempts to fix the core issue, the service fails every time it starts due to something automatically calling the `/add` endpoint with malformed data.

## CORE TECHNICAL ISSUE

**Primary Failure**: `Float32Array` objects are being JSON-serialized during HTTP transport, which transforms them into struct-like objects with numeric keys (`{0: value, 1: value, ...}`). When LanceDB receives these, it infers the schema as `struct` instead of the required `fixed_size_list<float32>[1536]`, causing immediate schema mismatch crashes.

**Evidence from Terminal Logs**:
```
❌ Add record failed: [Error: Failed to add batches to table semantic_search: lance error: Append with different schema: `embedding` should have type fixed_size_list:float:1536 but type was struct, `embedding` should have nullable=false but nullable=true, `embedding` had mismatched children, missing=[] unexpected=[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, ...]
```

## CRITICAL TASKS FOR NEXT AGENT

### PHASE 1: IMMEDIATE CLEANUP AND ENVIRONMENT RESET

1. **DELETE ALL TEST FILES AND SCRIPTS**
   - Remove ALL files matching patterns: `test-*.js`, `fix-table-*.js`, `generate-*.js`, `add-*.js`, `*test*.js`
   - Delete any remaining dummy data generation scripts in root directory
   - Clean up any background processes or scripts that auto-call `/add` endpoint
   - Verify NO scripts exist that automatically generate or insert test data

2. **REBUILD DEVELOPMENT ENVIRONMENT**
   - Kill all Node.js processes: `pkill -f node`
   - Clear npm cache: `rm -rf node_modules && npm cache clean --force`
   - Remove LanceDB data: `rm -rf /tmp/lancedb`
   - Reinstall dependencies: `npm install`
   - Verify clean state before proceeding

3. **IDENTIFY AND ELIMINATE AUTO-CALLING SOURCE**
   - The service starts successfully but immediately receives `/add` calls
   - Something is automatically calling the service with malformed embeddings
   - Terminal shows: "Received embedding type: object" immediately after startup
   - Find and eliminate this automatic caller

### PHASE 2: FIX CORE SCHEMA ISSUE

4. **RESOLVE FLOAT32ARRAY SERIALIZATION**
   - Problem: `Float32Array` → JSON → struct-like object `{0: val, 1: val, ...}`
   - Current code in `src/lancedb-service.js` attempts to handle this but fails
   - Need robust conversion from struct-like objects back to `number[]` arrays
   - Ensure Arrow batch ingestion with explicit schema works correctly

5. **VERIFY SCHEMA ENFORCEMENT**
   - Table schema MUST be: `FixedSizeList<float32>[1536] NOT NULL`
   - Verify `createEmptyTable` with explicit schema works
   - Ensure no schema inference occurs during ingestion
   - Test with manual record insertion to confirm schema stability

### PHASE 3: ESTABLISH STABLE SERVICE

6. **CLEAN SERVICE STARTUP**
   - Service should start without any automatic data insertion
   - Expected startup log sequence:
     ```
     🚀 Initializing LanceDB...
     ✅ Connected to LanceDB
     ✅ Created table with explicit vector schema
     🚀 LanceDB service running on port 8000
     ```
   - NO additional "Received embedding" messages should appear

7. **MANUAL VERIFICATION**
   - Test single record insertion via curl
   - Verify schema remains `fixed_size_list<float32>[1536] NOT NULL`
   - Confirm count endpoint works: `curl http://localhost:8000/count`
   - Test search functionality with known good data

### PHASE 4: DATA INGESTION PIPELINE

8. **TIMELINE TEXT INGESTION**
   - Use existing `scripts/re-ingest-all-text.ts` (confirmed working)
   - Should process ~342 timeline markdown files
   - Verify all records have correct schema after ingestion

9. **MEDIA INGESTION PREPARATION**
   - Update ingestion to handle S3 JSON media metadata
   - Include images, videos, audio with AI labels
   - Prepare for external S3 canonical data source integration

## FILES AND LOCATIONS

### Core Service Files:
- **`src/lancedb-service.js`**: Main LanceDB Express service with API endpoints
- **`lib/lancedb-ingestion.ts`**: Production ingestion logic and interfaces
- **`scripts/re-ingest-all-text.ts`**: Working timeline text ingestion script
- **`app/api/unified-search/route.ts`**: Next.js API route for frontend
- **`app/unified-search/page.tsx`**: Frontend search interface

### Configuration Files:
- **`LANCEDB_DEPLOYMENT_GUIDE.md`**: Contains implementation details and learnings
- **Package dependencies**: Ensure `@lancedb/lancedb`, `apache-arrow`, `gray-matter` are properly installed

## KNOWN TECHNICAL DETAILS

### Working Implementations:
- Table creation with explicit schema using `createEmptyTable`
- Arrow batch ingestion with `addBatches`/`addArrow` methods
- Lazy OpenAI client initialization to prevent startup crashes
- Frontend integration via `/unified-search` page

### Critical Requirements:
- OpenAI API key must be set: `export OPENAI_API_KEY="sk-..."`
- Port 8000 must be available
- LanceDB data directory: `/tmp/lancedb`
- Embedding dimension: 1536 (OpenAI text-embedding-ada-002)

## SUCCESS CRITERIA

1. **Service starts cleanly** without any automatic data insertion
2. **Manual record insertion works** with correct schema preservation
3. **Search functionality operates** correctly via frontend
4. **Timeline text ingested** successfully (342+ records)
5. **No schema mismatch errors** during any operation

## FAILURE MODES TO AVOID

- **DO NOT** create new test scripts or dummy data generators
- **DO NOT** allow any automatic calling of `/add` endpoint on startup
- **DO NOT** permit schema inference - always use explicit schema
- **DO NOT** proceed to media ingestion until text ingestion is verified stable

## PRIORITY ORDER

1. Clean up test files and rebuild environment (CRITICAL)
2. Fix Float32Array serialization issue (CRITICAL)
3. Establish stable service startup (HIGH)
4. Verify manual operations work (HIGH)
5. Complete timeline text ingestion (MEDIUM)
6. Prepare media ingestion pipeline (LOW)

The user has expressed extreme frustration with the recurring issues and demands a working solution without regression. The next agent must methodically address each phase without shortcuts or assumptions.
