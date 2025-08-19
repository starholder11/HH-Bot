# AGENTIC SYSTEM ARCHITECTURE

This document provides a comprehensive guide to understanding how the agentic system works in practice. It's written for humans who need to understand, debug, extend, or maintain this system.

The agentic system transforms natural language requests into executed workflows through a sophisticated planner-executor architecture. Users describe what they want in plain English, and the system orchestrates complex multi-step processes across various services, presenting results through spatial interfaces and streaming updates.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [Agent Implementations](#agent-implementations)
4. [Natural Language Processing Pipeline](#natural-language-processing-pipeline)
5. [The Planner-Executor Contract](#the-planner-executor-contract)
6. [Streaming and Real-Time Communication](#streaming-and-real-time-communication)
7. [Context Management and State](#context-management-and-state)
8. [Tool System and Registry](#tool-system-and-registry)
9. [Configuration Management](#configuration-management)
10. [Browser Execution Environment](#browser-execution-environment)
11. [Asset Management Pipeline](#asset-management-pipeline)
12. [Error Handling and Recovery](#error-handling-and-recovery)
13. [Observability and Debugging](#observability-and-debugging)
14. [Deployment Architecture](#deployment-architecture)
15. [Troubleshooting Guide](#troubleshooting-guide)
16. [Development Workflow](#development-workflow)

---

## System Overview

### What This System Does

The agentic system enables users to interact with a complex multimedia platform through natural language conversation. Instead of clicking through menus and forms, users say things like:

- "Find three cat pictures and pin them to the canvas"
- "Make a picture of a robot and save it as 'robo-friend'"
- "Search for videos about space and show me the results"

The system understands these requests, breaks them down into executable steps, and coordinates the execution across multiple services while providing real-time feedback to the user.

### High-Level Architecture

```
User Input (Natural Language)
    ↓
Frontend (Vercel) - Pure Proxy
    ↓
Backend (ECS Fargate) - Planner/Coordinator
    ↓
Tool Execution (Backend + Frontend)
    ↓
Results Streaming (SSE)
    ↓
Browser Execution + UI Updates
    ↓
Acknowledgment Loop
```

The system follows a **planner-executor pattern** where:

- **Backend** acts as the intelligent planner that understands intent and creates execution plans
- **Frontend** acts as the executor that performs UI actions and API calls
- **Streaming** provides real-time communication between planner and executor
- **Context** maintains state across interactions using Redis

---

## Architecture Principles

### 1. Separation of Concerns

**Planning vs Execution**: The backend is responsible for understanding what needs to be done. The frontend is responsible for actually doing it. This separation allows for:
- Complex multi-step logic to be centralized and testable
- UI actions to be responsive and immediate
- Clear debugging boundaries when things go wrong

### 2. Streaming-First Communication

All agent interactions use Server-Sent Events (SSE) to provide real-time feedback. This enables:
- Progressive disclosure of multi-step workflows
- Immediate UI updates as steps complete
- Cancellation and error handling mid-workflow

### 3. Hot-Reloadable Configuration

Critical system behavior is controlled by external JSON configuration files that can be updated without code deployments:
- Planner rules and examples
- Tool-to-UI action mappings
- Deferral and materialization rules

### 4. Correlation-Based Tracing

Every request generates a correlation ID (`corr_<timestamp>_<random>`) that flows through all logs, making debugging straightforward.

### 5. Graceful Degradation

The system is designed to provide partial functionality when components fail, with clear communication to users about what's happening.

---

## Agent Implementations

The system includes multiple agent implementations for different use cases:

### Primary Agent (`/api/agent`)
- **Purpose**: Production agent used by the main UI
- **Architecture**: Pure proxy to ECS backend
- **Features**: Full streaming, tool execution, acknowledgment loop
- **Backend**: Routes to `/api/agent-comprehensive` on ECS

### Comprehensive Agent (`/api/agent-comprehensive`)
- **Purpose**: Main backend agent with full workflow capabilities
- **Architecture**: Uses `SimpleWorkflowGenerator` + `SimpleIntentClassifier`
- **Features**: Multi-step planning, context awareness, hot-reloadable config
- **Deployment**: ECS Fargate behind ALB

### Simple Agent (`/api/agent-simple`)
- **Purpose**: Lightweight agent for basic operations
- **Architecture**: Direct tool execution without complex workflows
- **Features**: Basic intent detection, simple tool calling
- **Use Case**: Quick operations, testing, fallback scenarios

### Enhanced Agent (`/api/agent-enhanced`)
- **Purpose**: Advanced agent with sophisticated orchestration
- **Architecture**: Uses `EnhancedWorkflowGenerator` + `LangGraphOrchestrator`
- **Features**: Complex workflow graphs, advanced error handling
- **Status**: Experimental/development

### LangGraph Agent (`/api/agent-langgraph`)
- **Purpose**: Graph-based workflow orchestration
- **Architecture**: Uses LangGraph for complex state management
- **Features**: Stateful conversations, complex branching logic
- **Status**: Research/experimental

### V2 Agent (`/api/agent-v2`)
- **Purpose**: Next-generation agent with improved context handling
- **Architecture**: Enhanced context awareness, better tool selection
- **Features**: Improved intent detection, user context integration
- **Status**: Development/testing

---

## Natural Language Processing Pipeline

### Intent Classification

The system uses a sophisticated intent classification pipeline:

1. **Input Processing**: User message is cleaned and contextualized
2. **Pattern Matching**: Regex patterns detect common intents (search, create, organize)
3. **LLM Classification**: GPT-4 provides structured intent analysis
4. **Parameter Extraction**: Specific values (names, counts, types) are extracted
5. **Workflow Generation**: Multi-step workflows are created from intents

### Context Integration

The classifier considers:
- **Recent Searches**: What the user has been looking for
- **Current Canvas**: What's currently pinned or selected
- **Session History**: Previous interactions and preferences
- **Active Projects**: Current work context

### Example Flow

```
User: "find three cat pictures and pin them"
    ↓
Intent: SEARCH + ORGANIZE
    ↓
Workflow: [
  { tool: "searchUnified", params: { query: "cat pictures" } },
  { tool: "pinToCanvas", params: { count: 3 } }
]
    ↓
Execution: Search executes → Results stream → Pin executes → Canvas updates
```

---

## The Planner-Executor Contract

This is the core architectural pattern that makes the system work.

### The Contract

1. **Backend (Planner)** receives natural language input
2. **Backend** generates a structured workflow with ordered steps
3. **Backend** streams step-by-step execution events to frontend
4. **Frontend (Executor)** receives each step and performs the actual work
5. **Frontend** updates the UI immediately so users see progress
6. **Frontend** sends acknowledgment back to backend with any artifacts
7. **Backend** waits for acknowledgment before proceeding to next step

### Why This Pattern Works

- **Separation of Intelligence**: Complex planning logic stays on the backend where it can be sophisticated and testable
- **Responsive UI**: Frontend can update immediately without waiting for backend processing
- **Error Isolation**: If a step fails, the failure is contained and can be retried or skipped
- **Debugging**: Each step is logged and traceable independently

### Implementation Details

**Backend (Planner)**:
```typescript
// services/intelligence/SimpleWorkflowGenerator.ts
const workflow = await this.executeWorkflow(workflowExecution);
// Emits steps like:
// { action: "searchUnified", payload: { query: "cats" } }
// { action: "pinToCanvas", payload: { count: 3 } }
```

**Frontend (Executor)**:
```typescript
// app/workshop/page.tsx
useAgentStream(stream => {
  stream.onTool(toolAction => {
    __agentApi[toolAction.action](toolAction.payload);
  });
});
```

---

## Streaming and Real-Time Communication

### Server-Sent Events (SSE)

The system uses SSE for real-time communication:

1. **Client** makes POST to `/api/agent`
2. **Frontend** proxies to ECS backend
3. **Backend** returns SSE stream
4. **Frontend** processes events and dispatches to UI handlers

### Event Types

- **Tool Actions**: Instructions for the frontend to execute
- **Status Updates**: Progress information for the user
- **Error Events**: Failure notifications with recovery options
- **Completion Events**: Final results and next steps

### Stream Processing

```typescript
// Browser receives events like:
{
  type: "tool",
  action: "saveImage",
  payload: {
    name: "my-robot",
    correlationId: "corr_1234567890_abc123"
  }
}
```

### Acknowledgment Loop

After executing each action, the frontend sends an acknowledgment:

```typescript
fetch('/api/agent/ack', {
  method: 'POST',
  body: JSON.stringify({
    correlationId: "corr_1234567890_abc123",
    step: "saveimage",
    artifacts: { assetId: "asset-uuid-here" }
  })
});
```

---

## Context Management and State

### Redis-Based Context

The system uses Redis to maintain context across interactions:

**File**: `services/context/RedisContextService.ts`

### What We Store

#### User Context (`context:<tenantId>:<userId>`)
- **Active Projects**: Current work sessions
- **Recent Searches**: Last 10 search queries with timestamps
- **Canvas Items**: Currently pinned items and their metadata
- **Preferences**: User settings and behavioral patterns
- **Session History**: Recent interactions (capped at 50 events)
- **Last Activity**: Timestamp for session management
- **TTL**: 24 hours

#### Workflow State (`workflow:<executionId>`)
- **Execution ID**: Unique identifier for the workflow
- **Tenant/User IDs**: Ownership information
- **Correlation ID**: For log tracing
- **Workflow Type**: Classification of the operation
- **Status**: pending, running, completed, failed
- **Current Step**: Which step is currently executing
- **Context**: Relevant data for the workflow
- **Results**: Outputs from completed steps
- **Errors**: Any failures that occurred
- **Timestamps**: Created, started, completed times
- **TTL**: 7 days

### Key Operations

#### Correlation ID Generation
```typescript
generateCorrelationId() → "corr_<epoch>_<random8>"
```

#### Context Retrieval
```typescript
getUserContext(userId, tenantId) → {
  activeProjects: [],
  recentSearches: [],
  canvasItems: [],
  preferences: {},
  sessionHistory: [],
  lastActivity: timestamp
}
```

#### Workflow Management
```typescript
createWorkflowState(params) → "workflow_<epoch>_<random>"
updateWorkflowState(state) → void
getUserActiveWorkflows(userId) → WorkflowState[]
```

### Context-Aware Features

- **Smart Defaults**: System remembers user preferences
- **Reference Resolution**: "Show me more like that" works because we track recent searches
- **Workflow Continuity**: Multi-step processes can be resumed after interruption
- **Personalization**: Behavior adapts to user patterns over time

---

## Tool System and Registry

The system supports three types of tools that can be called by the agent:

### Core Tools
**File**: `services/tools/CoreTools.ts`

Hand-written, fundamental operations:
- `searchUnified`: Search across all content types
- `createCanvas`: Create new canvas collections
- `pinToCanvas`: Add items to canvas
- `prepareGenerate`: Set up content generation
- `nameImage`: Set names for generated content
- `saveImage`: Persist content to storage

### Comprehensive Tools
**File**: `services/tools/ComprehensiveTools.ts`

Curated, higher-level operations with strict schemas:
- Complex multi-step operations
- Domain-specific workflows
- Quality-controlled implementations

### Generated API Tools
**File**: `services/tools/ToolFactory.ts`

Automatically discovered from API routes:
- Scans `app/api/**/route.ts` files
- Generates Zod schemas from TypeScript types
- Creates execution wrappers
- Handles authentication and error translation

### Universal Tool Registry
**File**: `services/tools/UniversalToolRegistry.ts`

Central registry that:
- Registers all tool types
- Normalizes different execution patterns
- Provides AI SDK compatibility
- Handles tool discovery and selection

### Tool Execution Flow

1. **Planner** selects appropriate tool based on intent
2. **Registry** resolves tool implementation
3. **Executor** determines execution location (backend vs frontend)
4. **Tool** executes with proper error handling and logging
5. **Results** are returned to the workflow engine

### Adding New Tools

1. **For Core Operations**: Add to `CoreTools.ts`
2. **For Complex Workflows**: Add to `ComprehensiveTools.ts`
3. **For API Operations**: Create API route, auto-discovered
4. **For UI Actions**: Add to `config/ui-map.json`

---

## Configuration Management

### Hot-Reloadable Configuration

Critical system behavior is controlled by external JSON files that can be updated without code deployments.

### Planner Rules (`config/planner-rules.json`)

Controls how the AI planner interprets user requests:

```json
{
  "version": "v1.2-fix-duplicates-and-names",
  "systemPrompt": "You are an AI workflow planner...",
  "examples": [
    {
      "input": "make a picture of a cat and name it toby",
      "output": [
        { "tool_name": "prepareGenerate", "parameters": { "prompt": "cat", "type": "image" } },
        { "tool_name": "nameImage", "parameters": { "name": "toby" } },
        { "tool_name": "saveImage", "parameters": {} }
      ]
    }
  ]
}
```

### UI Mapping (`config/ui-map.json`)

Controls how backend tools map to frontend actions:

```json
{
  "version": "v1.2",
  "toolsToActions": {
    "searchUnified": "searchUnified",
    "pinToCanvas": "pinToCanvas",
    "nameImage": "nameImage",
    "saveImage": "saveImage"
  },
  "deferToFrontend": {
    "saveImage": { "always": true },
    "nameImage": { "condition": "no_assetId" }
  },
  "materializationRules": {
    "pinToCanvas": {
      "requires": ["nameImage", "saveImage"],
      "condition": "no_persisted_asset"
    }
  }
}
```

### Configuration Loading

**File**: `services/config/RemoteConfig.ts`

- Fetches configurations from S3 URLs
- Implements ETag-based caching
- Validates schemas using Zod
- Provides TTL-based refresh
- Handles fallback to defaults on failure

### Environment Variables

**ECS Backend**:
- `PLANNER_RULES_URL`: URL to planner configuration
- `UI_MAP_URL`: URL to UI mapping configuration
- `UI_MAP_TTL_SEC`: Cache TTL in seconds
- `APP_BUILD_SHA`: Build fingerprint for debugging

---

## Browser Execution Environment

### The `__agentApi` System

The browser maintains a global `__agentApi` object that contains handlers for all possible agent actions.

**File**: `app/workshop/page.tsx`

### Handler Pattern

Each handler follows the same pattern:

1. **Execute**: Perform the actual work (API calls, UI updates)
2. **Update**: Immediately update the UI so users see progress
3. **Acknowledge**: Send confirmation back to the backend

### Example Handler

```typescript
__agentApi = {
  saveImage: async (payload) => {
    try {
      // 1. EXECUTE: Do the actual work
      const mediaType = detectMediaType(genUrlRef.current);
      const response = await fetch('/api/import/url', {
        method: 'POST',
        body: JSON.stringify({
          url: genUrlRef.current,
          mediaType: mediaType,
          title: payload.name || lastNameRef.current
        })
      });
      
      // 2. UPDATE: Update UI immediately
      const savedAsset = await response.json();
      updateUIWithSavedAsset(savedAsset);
      
      // 3. ACKNOWLEDGE: Tell backend we're done
      await fetch('/api/agent/ack', {
        method: 'POST',
        body: JSON.stringify({
          correlationId: payload.correlationId,
          step: 'saveimage',
          artifacts: { assetId: savedAsset.id }
        })
      });
      
    } catch (error) {
      console.error('saveImage failed:', error);
      // Send error acknowledgment
    }
  }
};
```

### Stream Processing Hook

```typescript
// app/workshop/hooks/useAgentStream.ts
useAgentStream(eventStream => {
  eventStream.onTool(toolAction => {
    const handler = __agentApi[toolAction.action];
    if (handler) {
      handler(toolAction.payload);
    } else {
      console.warn(`No handler for action: ${toolAction.action}`);
    }
  });
});
```

### Agent Trigger Detection

The UI determines when to use the agent vs regular search:

```typescript
const agentTriggers = [
  'find', 'search', 'show', 'pin', 'make', 'create', 
  'generate', 'build', 'name', 'save', 'call it'
];

if (agentTriggers.some(trigger => userInput.includes(trigger))) {
  // Use agent stream
  triggerAgentWorkflow(userInput);
} else {
  // Use regular search
  performRegularSearch(userInput);
}
```

---

## Asset Management Pipeline

### Save Pipeline Overview

When users generate or import content, it flows through a standardized pipeline:

1. **Entry Point**: `/api/import/url` receives URL and metadata
2. **Download**: Content is fetched from the source URL
3. **Upload**: Content is uploaded to S3 with proper naming
4. **Dispatch**: Request is routed to appropriate finish-upload handler
5. **Processing**: Metadata extraction, AI labeling, thumbnail generation
6. **Storage**: Asset JSON is saved to database
7. **Indexing**: Content is queued for search index ingestion

### Media Type Handling

**Images** (`/api/media-labeling/images/finish-upload`):
- Extract EXIF metadata
- Generate thumbnails
- Perform AI labeling for searchability
- Save asset JSON with all metadata

**Videos** (`/api/media-labeling/videos/finish-upload`):
- Extract video metadata (duration, resolution, codec)
- Generate keyframe thumbnails
- Queue for analysis (scene detection, etc.)
- Enqueue for search indexing

**Audio** (`/api/audio-labeling/finish-upload`):
- Extract audio metadata (duration, bitrate, format)
- Attempt immediate search index ingestion
- Fall back to queue on failure

### AI Labeling Process

**File**: `lib/ai-labeling.ts`

1. **Content Analysis**: AI analyzes visual/audio content
2. **Label Generation**: Descriptive tags and categories
3. **Metadata Enhancement**: Enriched searchable metadata
4. **Index Preparation**: Content prepared for search ingestion

### Storage Architecture

- **S3 Buckets**: Raw content storage with CloudFront CDN
- **JSON Database**: Metadata and relationships (Vercel/Supabase)
- **Search Index**: Vector embeddings for semantic search
- **Redis Cache**: Temporary state and session data

---

## Error Handling and Recovery

### Error Categories

#### Transient Errors
- Network timeouts
- Rate limiting
- Temporary service unavailability
- **Recovery**: Automatic retry with exponential backoff

#### Configuration Errors
- Invalid parameters
- Missing required fields
- Type mismatches
- **Recovery**: Clear error messages with correction guidance

#### System Errors
- Service outages
- Resource exhaustion
- Authentication failures
- **Recovery**: Graceful degradation with alternative approaches

#### User Errors
- Ambiguous requests
- Impossible operations
- Insufficient permissions
- **Recovery**: Educational feedback with suggested alternatives

### Error Handling Patterns

#### Circuit Breaker Pattern
```typescript
class ServiceCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  async call(operation: () => Promise<any>) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

#### Retry Logic
```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  backoffMs: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      
      const delay = backoffMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

#### Graceful Degradation
```typescript
async function searchWithFallback(query: string) {
  try {
    return await semanticSearch(query);
  } catch (error) {
    console.warn('Semantic search failed, falling back to keyword search');
    try {
      return await keywordSearch(query);
    } catch (fallbackError) {
      console.warn('Keyword search failed, returning cached results');
      return await getCachedResults(query);
    }
  }
}
```

### Error Communication

Errors are communicated to users through:
- **Clear Messages**: Human-readable explanations of what went wrong
- **Actionable Guidance**: Specific steps users can take to resolve issues
- **Alternative Approaches**: Suggestions for different ways to accomplish goals
- **Context Preservation**: Maintaining user progress when possible

---

## Observability and Debugging

### Correlation ID Tracing

Every request generates a unique correlation ID that flows through all system components:

```
corr_1755615217164_bf6a9951
```

This ID appears in:
- Frontend console logs
- Backend application logs
- Database query logs
- External service calls
- Error reports

### Logging Strategy

#### Frontend Logging
```typescript
console.log(`[${correlationId}] UI: searchUnified handler called`);
console.log(`[${correlationId}] UI: Starting search execution...`);
console.log(`[${correlationId}] UI: ✅ searchUnified ack sent`);
```

#### Backend Logging
```typescript
console.log(`[${correlationId}] Processing: "${userMessage}"`);
console.log(`[${correlationId}] Intent: ${intent.intent} (confidence: ${intent.confidence})`);
console.log(`[${correlationId}] Workflow completed in ${totalTime}ms`);
```

### Build Fingerprinting

Every deployment includes a build SHA that appears in logs and health checks:

```typescript
const buildSha = process.env.APP_BUILD_SHA || 'unknown';
console.log(`[${correlationId}] BUILD_SHA: ${buildSha}`);
```

### Diagnostic Endpoints

#### Health Check (`/api/health`)
```json
{
  "ok": true,
  "status": "healthy",
  "buildFingerprint": "abc123def456",
  "deploymentTest": "CORRELATION_FIX_DEPLOYED_v2",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Correlation Diagnostic (`/api/corr-diagnostic`)
```json
{
  "routeCorr": "corr_1234567890_abc123",
  "generatorCorr": "corr_1234567890_abc123",
  "executionId": "workflow_1234567890_def456",
  "buildSha": "abc123def456",
  "file": "/app/api/corr-diagnostic/route.ts"
}
```

### Performance Monitoring

- **Workflow Execution Times**: How long each workflow takes
- **Tool Performance**: Success rates and latency for each tool
- **Error Rates**: Frequency and types of failures
- **User Patterns**: Most common requests and workflows

---

## Deployment Architecture

### Infrastructure Overview

```
Internet
    ↓
CloudFlare (CDN)
    ↓
Vercel (Frontend)
    ↓
AWS ALB (Load Balancer)
    ↓
ECS Fargate (Backend)
    ↓
Redis (Context) + S3 (Storage) + Lambda (Processing)
```

### Frontend Deployment (Vercel)

- **Platform**: Vercel serverless
- **Trigger**: Git push to main branch
- **Build**: Next.js static generation
- **Features**: Edge functions, automatic scaling
- **Environment**: Production environment variables

### Backend Deployment (AWS ECS Fargate)

- **Platform**: AWS ECS Fargate
- **Image**: `781939061434.dkr.ecr.us-east-1.amazonaws.com/hh-agent-app:latest`
- **Service**: `hh-agent-app-service-v2` (load-balanced)
- **Health Check**: `curl -f http://localhost:3000/api/health`
- **Scaling**: Auto-scaling based on CPU/memory

### Docker Build Process

```dockerfile
# Multi-stage build for optimization
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runtime
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "server.js"]
```

### Environment Configuration

**ECS Environment Variables**:
- `PLANNER_RULES_URL`: S3 URL for planner configuration
- `UI_MAP_URL`: S3 URL for UI mapping configuration
- `APP_BUILD_SHA`: Git commit hash for debugging
- `REDIS_AGENTIC_URL`: Redis connection string
- `OPENAI_API_KEY`: OpenAI API access
- `AWS_REGION`: AWS region for services

### Deployment Process

1. **Code Changes**: Developer commits to Git
2. **Docker Build**: Image built with `--platform linux/amd64`
3. **ECR Push**: Image pushed to Elastic Container Registry
4. **Task Definition**: Updated with new image and build SHA
5. **Service Update**: ECS service updated with new task definition
6. **Health Check**: New tasks must pass health checks
7. **Traffic Switch**: Load balancer routes to healthy tasks

---

## Troubleshooting Guide

### UI Stalls After Action

**Symptoms**: User performs action, UI shows loading but never completes

**Debugging Steps**:
1. Check browser console for correlation ID and action logs
2. Verify acknowledgment was sent: look for "✅ [action] ack sent"
3. Check ECS logs for correlation ID to see if backend received ACK
4. Verify workflow completion in backend logs

**Common Causes**:
- Missing acknowledgment in UI handler
- Network failure during ACK request
- Backend waiting for ACK that never arrives
- Correlation ID mismatch between frontend and backend

### Asset Saves But Isn't Searchable

**Symptoms**: Content is saved successfully but doesn't appear in search results

**Debugging Steps**:
1. Verify asset exists: `GET /api/media-labeling/assets/:id`
2. Check processing status: `processing_status.ai_labeling === 'completed'`
3. Manually re-enqueue: `GET /api/test-sqs?assetId=...&mediaType=...`
4. Check Lambda ingestion logs for errors

**Common Causes**:
- AI labeling process failed
- Search indexing queue not processing
- Lambda worker crashed during ingestion
- Network issues between services

### Planner Generates Wrong Workflow

**Symptoms**: Agent misunderstands user intent or creates incorrect steps

**Debugging Steps**:
1. Check ECS logs for planner version: should show config version
2. Verify environment variables: `PLANNER_RULES_URL` must be set
3. Inspect planner config: ensure examples cover the use case
4. Test with diagnostic endpoint: `/api/corr-diagnostic`

**Common Causes**:
- Missing or outdated planner configuration
- Environment variables not set in ECS
- Configuration file not accessible (S3 permissions)
- Insufficient examples in planner rules

### Build Fingerprint Mismatch

**Symptoms**: Deployed code doesn't match expected version

**Debugging Steps**:
1. Check health endpoint: `/api/health` should show correct build SHA
2. Verify ECS task definition has correct `APP_BUILD_SHA`
3. Confirm correct ECS service is being updated
4. Check Docker image tags in ECR

**Common Causes**:
- Wrong ECS service updated (not the load-balanced one)
- Build SHA not updated in task definition
- Docker image not properly tagged or pushed
- Caching issues in deployment pipeline

### Configuration Not Loading

**Symptoms**: System falls back to default behavior instead of using remote config

**Debugging Steps**:
1. Test config URLs directly: `curl [CONFIG_URL]`
2. Check S3 bucket permissions for public read access
3. Verify ECS environment variables are set
4. Check backend logs for config loading errors

**Common Causes**:
- S3 bucket not publicly accessible
- Environment variables missing or incorrect
- Configuration file syntax errors
- Network connectivity issues from ECS to S3

---

## Development Workflow

### Local Development

1. **Clone Repository**: `git clone [repo-url]`
2. **Install Dependencies**: `npm install`
3. **Environment Setup**: Copy `.env.example` to `.env.local`
4. **Start Development**: `npm run dev`
5. **Test Changes**: Use `/api/corr-diagnostic` for testing

### Configuration Changes

1. **Edit Config Files**: Modify `config/planner-rules.json` or `config/ui-map.json`
2. **Upload to S3**: Update files in S3 bucket
3. **Clear Cache**: `POST /api/agent/reload` to force reload
4. **Test Changes**: Verify new behavior works as expected

### Backend Deployment

1. **Make Changes**: Edit backend code
2. **Test Locally**: Verify changes work in development
3. **Build Image**: `./scripts/ultra-fast-build.sh` for development
4. **Push to ECR**: `./scripts/push-to-ecr.sh` for production
5. **Verify Deployment**: Check health endpoint and logs

### Frontend Deployment

1. **Make Changes**: Edit frontend code
2. **Test Locally**: Verify UI changes work
3. **Commit and Push**: `git add . && git commit -m "..." && git push`
4. **Vercel Auto-Deploy**: Vercel automatically deploys on push
5. **Verify Deployment**: Check live site

### Debugging Workflow

1. **Identify Issue**: User reports problem or error occurs
2. **Find Correlation ID**: Look in browser console or logs
3. **Trace Through System**: Follow correlation ID through all logs
4. **Identify Root Cause**: Determine where the flow breaks
5. **Implement Fix**: Make targeted fix based on root cause
6. **Test Fix**: Verify fix resolves the issue
7. **Deploy**: Push fix through appropriate deployment pipeline

### Adding New Features

1. **Design**: Plan the feature and its integration points
2. **Backend Changes**: Add tools, update planner rules if needed
3. **Frontend Changes**: Add UI handlers, update agent triggers
4. **Configuration**: Update config files for new behaviors
5. **Testing**: Test end-to-end workflow
6. **Documentation**: Update this document with changes
7. **Deployment**: Deploy through standard process

---

This document serves as the definitive guide to understanding and working with the agentic system. It should be updated whenever significant changes are made to the architecture, and all team members should refer to it when debugging issues or implementing new features.

The system is designed to be observable, debuggable, and maintainable. When in doubt, follow the correlation IDs through the logs, and remember that the planner-executor contract is the foundation that makes everything work.
