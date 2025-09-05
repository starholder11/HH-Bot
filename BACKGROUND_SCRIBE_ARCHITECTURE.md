# Background Scribe Architecture
## Technical Specification for Agentic Conversation Summarization

---

## Executive Summary

This document defines the technical architecture for the Background Scribe system - an agentic service that automatically converts ongoing conversations into living narrative documents. The system integrates with the existing lore chat modal, S3 text assets, and Redis context management to provide seamless conversation-to-document synthesis.

---

## Current State Analysis

### What We Have ✅
- **LoreScribeModal**: Tabbed modal with Lore chat + Scribe document editor
- **S3 Text Assets**: UUID-based text storage with `/api/media-assets` CRUD
- **Agent-Lore Route**: Proxies to `/api/chat` with document context
- **Redis Context Service**: User sessions, workflow state, correlation tracking
- **Continue Conversation**: Button that loads S3 text content into modal

### What We Need 🔨
- **Background Document Tracking**: Redis-based state for active scribe sessions
- **Conversation Message Capture**: System to track and accumulate conversation turns
- **Background Summarizer Service**: Periodic conversion of messages to narrative content
- **Scribe Control APIs**: Start/stop/toggle endpoints for scribe management
- **Document Update Pipeline**: Automatic S3 asset updates with OAI sync

---

## Technical Architecture

### 1. Redis Data Model Extensions

#### Background Documents Registry
```typescript
// Key: `scribe:active:{conversationId}`
interface ActiveBackgroundDoc {
  conversationId: string;
  textAssetId: string;        // S3 UUID
  slug: string;               // Human-readable identifier
  title: string;
  scribeEnabled: boolean;
  lastMessageCount: number;   // Track processed messages
  lastUpdateAt: string;       // ISO timestamp
  userId: string;
  tenantId: string;
  createdAt: string;
}

// Key: `scribe:messages:{conversationId}`
interface ConversationMessages {
  conversationId: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    processed: boolean;       // Track summarizer processing
  }>;
  totalCount: number;
  lastActivity: string;
}
```

#### Redis Operations
```typescript
class ScribeRedisService extends RedisContextService {
  // Background document management
  async registerBackgroundDoc(doc: ActiveBackgroundDoc): Promise<void>
  async getActiveBackgroundDocs(): Promise<ActiveBackgroundDoc[]>
  async updateBackgroundDocState(conversationId: string, updates: Partial<ActiveBackgroundDoc>): Promise<void>
  async disableBackgroundDoc(conversationId: string): Promise<void>

  // Message accumulation
  async addConversationMessage(conversationId: string, message: ConversationMessage): Promise<void>
  async getUnprocessedMessages(conversationId: string, fromCount: number): Promise<ConversationMessage[]>
  async markMessagesProcessed(conversationId: string, messageIds: string[]): Promise<void>
}
```

### 2. Background Summarizer Service

#### Core Service Architecture
```typescript
// File: services/lore/BackgroundSummarizer.ts
export class BackgroundSummarizer {
  private redis: ScribeRedisService;
  private openai: OpenAI;

  constructor() {
    this.redis = new ScribeRedisService(process.env.REDIS_URL);
    this.openai = getOpenAIClient();
  }

  // Main processing loop
  async processActiveDocuments(): Promise<void> {
    const activeDocs = await this.redis.getActiveBackgroundDocs();

    for (const doc of activeDocs) {
      if (!doc.scribeEnabled) continue;

      try {
        await this.updateDocument(doc);
      } catch (error) {
        console.error(`[Summarizer] Failed to update ${doc.slug}:`, error);
        // Continue processing other documents
      }
    }
  }

  // Document update logic
  async updateDocument(doc: ActiveBackgroundDoc): Promise<void> {
    // Get new unprocessed messages
    const newMessages = await this.redis.getUnprocessedMessages(
      doc.conversationId,
      doc.lastMessageCount
    );

    if (newMessages.length === 0) return;

    // Load current document content
    const currentAsset = await getMediaAsset(doc.textAssetId);
    if (!currentAsset) {
      console.warn(`[Summarizer] Text asset ${doc.textAssetId} not found`);
      return;
    }

    // Generate updated narrative content
    const updatedContent = await this.generateNarrativeUpdate(
      newMessages,
      currentAsset.content || '',
      doc.title,
      this.detectConversationStyle(newMessages)
    );

    // Update S3 text asset
    const updatedAsset = {
      ...currentAsset,
      content: updatedContent,
      updated_at: new Date().toISOString(),
      metadata: {
        ...currentAsset.metadata,
        last_scribe_update: new Date().toISOString(),
        message_count: doc.lastMessageCount + newMessages.length
      }
    };

    await saveMediaAsset(doc.textAssetId, updatedAsset);

    // Update tracking state
    await this.redis.updateBackgroundDocState(doc.conversationId, {
      lastMessageCount: doc.lastMessageCount + newMessages.length,
      lastUpdateAt: new Date().toISOString()
    });

    // Mark messages as processed
    await this.redis.markMessagesProcessed(
      doc.conversationId,
      newMessages.map(m => m.id)
    );

    console.log(`[Summarizer] Updated ${doc.slug}: +${newMessages.length} messages`);
  }
}
```

#### Narrative Generation Strategy
```typescript
async generateNarrativeUpdate(
  newMessages: ConversationMessage[],
  existingContent: string,
  documentTitle: string,
  style: 'literary' | 'factual' | 'conversational'
): Promise<string> {
  const systemPrompt = this.buildSystemPrompt(style);
  const updatePrompt = this.buildUpdatePrompt(newMessages, existingContent, documentTitle);

  const response = await this.openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: updatePrompt }
    ],
    temperature: style === 'literary' ? 0.8 : 0.3,
    max_tokens: 2000
  });

  return response.choices[0]?.message?.content || existingContent;
}

private buildSystemPrompt(style: string): string {
  const basePrompt = "You are a skilled narrative synthesizer creating engaging Starholder universe content.";

  switch (style) {
    case 'literary':
      return `${basePrompt} Write in flowing, literary prose that captures the essence of worldbuilding discussions. Create compelling narrative that reads like a short story or article.`;
    case 'factual':
      return `${basePrompt} Write clearly and factually while maintaining narrative engagement. Focus on concrete details and logical progression.`;
    case 'conversational':
      return `${basePrompt} Maintain the conversational tone while structuring it into readable narrative. Preserve the natural flow of ideas.`;
    default:
      return basePrompt;
  }
}

private buildUpdatePrompt(messages: ConversationMessage[], existingContent: string, title: string): string {
  const messageText = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');

  return `
Update this Starholder universe document with new conversation content:

DOCUMENT TITLE: ${title}

CURRENT CONTENT:
${existingContent}

NEW CONVERSATION TO INTEGRATE:
${messageText}

INSTRUCTIONS:
- Seamlessly integrate the new conversation into the existing narrative
- Maintain the document's established tone and structure
- Convert dialogue into flowing narrative prose
- Preserve important details and worldbuilding elements
- Keep the content engaging and readable
- Add new sections or expand existing ones as appropriate
- Maintain any existing metadata or structure at the bottom

Return the complete updated document.
`;
}
```

### 3. API Endpoints

#### Background Document Management
```typescript
// File: app/api/chat/background-doc/start/route.ts
export async function POST(req: NextRequest) {
  const { conversationId, title, userId = 'default-user', tenantId = 'default' } = await req.json();

  // Create S3 text asset
  const textAssetId = randomUUID();
  const slug = slugify(title);
  const initialContent = `# ${title}\n\n*The scribe will populate this document as your conversation continues...*`;

  const textAsset = {
    id: textAssetId,
    media_type: 'text',
    title,
    content: initialContent,
    metadata: {
      slug,
      source: 'conversation',
      status: 'draft',
      scribe_enabled: true,
      conversation_id: conversationId,
      categories: ['lore', 'conversation']
    },
    // ... standard MediaAsset fields
  };

  await saveMediaAsset(textAssetId, textAsset);

  // Register in Redis
  const backgroundDoc: ActiveBackgroundDoc = {
    conversationId,
    textAssetId,
    slug,
    title,
    scribeEnabled: true,
    lastMessageCount: 0,
    lastUpdateAt: new Date().toISOString(),
    userId,
    tenantId,
    createdAt: new Date().toISOString()
  };

  const scribeService = new ScribeRedisService();
  await scribeService.registerBackgroundDoc(backgroundDoc);

  return NextResponse.json({
    success: true,
    textAssetId,
    slug,
    title,
    conversationId
  });
}

// File: app/api/chat/background-doc/toggle/route.ts
export async function POST(req: NextRequest) {
  const { conversationId, scribeEnabled } = await req.json();

  const scribeService = new ScribeRedisService();
  await scribeService.updateBackgroundDocState(conversationId, { scribeEnabled });

  return NextResponse.json({ success: true, scribeEnabled });
}
```

#### Message Tracking Integration
```typescript
// Update existing agent-lore route to capture messages
// File: app/api/agent-lore/route.ts (enhancement)

// After successful chat response, capture the conversation
const scribeService = new ScribeRedisService();
await scribeService.addConversationMessage(conversationId || 'default', {
  id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  role: 'user',
  content: lastMessage.content,
  timestamp: new Date().toISOString(),
  processed: false
});

// Also capture assistant response when stream completes
// (This requires enhancing the streaming response to track completion)
```

### 4. Deployment Architecture

#### Option A: Lambda-based Background Service
```typescript
// File: lambda-background-summarizer/index.js
const { BackgroundSummarizer } = require('./BackgroundSummarizer');

exports.handler = async (event) => {
  console.log('Background summarizer triggered');

  const summarizer = new BackgroundSummarizer();

  try {
    await summarizer.processActiveDocuments();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Processing complete',
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Summarizer failed:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
```

#### CloudWatch Trigger Configuration
```json
{
  "Rules": [{
    "Name": "background-summarizer-schedule",
    "Description": "Trigger background document summarizer every 20 seconds for high responsivity",
    "ScheduleExpression": "rate(20 seconds)",
    "State": "ENABLED",
    "Targets": [{
      "Id": "1",
      "Arn": "arn:aws:lambda:us-east-1:ACCOUNT:function:background-summarizer",
      "Input": "{\"source\": \"cloudwatch-events\"}"
    }]
  }]
}
```

#### Option B: ECS Background Service (Alternative)
```typescript
// File: services/lore/SummarizerWorker.ts
export class SummarizerWorker {
  private summarizer: BackgroundSummarizer;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.summarizer = new BackgroundSummarizer();
  }

  start(intervalMs: number = 20000) { // 20 seconds
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`[SummarizerWorker] Starting with ${intervalMs}ms interval`);

    this.intervalId = setInterval(async () => {
      try {
        await this.summarizer.processActiveDocuments();
      } catch (error) {
        console.error('[SummarizerWorker] Cycle failed:', error);
      }
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('[SummarizerWorker] Stopped');
    }
  }
}

// Usage in ECS container
const worker = new SummarizerWorker();
worker.start();

process.on('SIGTERM', () => worker.stop());
```

### 5. Integration Points

#### Enhanced Agent-Lore Route
```typescript
// File: app/api/agent-lore/route.ts (additions)

// After processing scribe start command
if (scribeIntent.isStart) {
  // ... existing S3 asset creation ...

  // Register background document
  const scribeService = new ScribeRedisService();
  await scribeService.registerBackgroundDoc({
    conversationId: finalConversationId,
    textAssetId,
    slug,
    title,
    scribeEnabled: true,
    lastMessageCount: 0,
    lastUpdateAt: new Date().toISOString(),
    userId: 'current-user', // Extract from session
    tenantId: 'default',
    createdAt: new Date().toISOString()
  });

  // Start capturing messages for this conversation
  await scribeService.initializeMessageTracking(finalConversationId);
}

// Message capture on every conversation turn
const scribeService = new ScribeRedisService();
await scribeService.addConversationMessage(conversationId, {
  id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  role: 'user',
  content: lastMessage.content,
  timestamp: new Date().toISOString(),
  processed: false
});
```

#### Enhanced Scribe Editor UI
```typescript
// File: components/lore/ScribeEditor.tsx (enhancements)

interface ScribeEditorProps {
  documentData: TextAssetData & {
    id?: string;           // S3 UUID
    conversation_id?: string;
    scribe_enabled?: boolean;
  };
  scribeEnabled: boolean;
  onScribeToggle: (enabled: boolean) => void;
  onSave: (data: { content: string; slug: string; title: string }) => void;
}

const ScribeEditor = ({ documentData, scribeEnabled, onScribeToggle, onSave }: ScribeEditorProps) => {
  const [lastScribeUpdate, setLastScribeUpdate] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState<number>(0);

  // Poll for scribe updates
  useEffect(() => {
    if (!scribeEnabled || !documentData?.conversation_id) return;

    const interval = setInterval(async () => {
      try {
        // Check if document has been updated by background service
        const response = await fetch(`/api/media-assets/${documentData.id}`);
        if (response.ok) {
          const data = await response.json();
          const lastUpdate = data.asset?.metadata?.last_scribe_update;

          if (lastUpdate && lastUpdate !== lastScribeUpdate) {
            setLastScribeUpdate(lastUpdate);
            // Refresh content (but preserve user edits)
            // Implementation TBD based on conflict resolution strategy
          }
        }
      } catch (error) {
        console.error('Failed to check for scribe updates:', error);
      }
            }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [scribeEnabled, documentData?.id, lastScribeUpdate]);

  const handleToggleScribe = async () => {
    if (!documentData?.conversation_id) return;

    try {
      const response = await fetch('/api/chat/background-doc/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: documentData.conversation_id,
          scribeEnabled: !scribeEnabled
        })
      });

      if (response.ok) {
        onScribeToggle(!scribeEnabled);
      }
    } catch (error) {
      console.error('Failed to toggle scribe:', error);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Enhanced header with scribe status */}
      <div className="flex justify-between items-center p-4 border-b border-neutral-800">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {documentData?.title || 'Untitled Document'}
          </h3>
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <div className={`w-2 h-2 rounded-full ${scribeEnabled ? 'bg-green-500' : 'bg-neutral-600'}`} />
            <span>{scribeEnabled ? 'AI updating document' : 'Manual editing mode'}</span>
            {lastScribeUpdate && (
              <span className="text-xs">
                Last AI update: {new Date(lastScribeUpdate).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleToggleScribe}
            variant={scribeEnabled ? "destructive" : "default"}
            size="sm"
          >
            {scribeEnabled ? "Stop Scribe" : "Start Scribe"}
          </Button>
          {/* ... other buttons ... */}
        </div>
      </div>

      {/* Document editor */}
      <div className="flex-1 p-4">
        {/* ... existing editor implementation ... */}
      </div>
    </div>
  );
};
```

### 6. Deployment Strategy

#### Recommended: Lambda + CloudWatch Events
**Pros:**
- Serverless scaling
- No infrastructure management
- Built-in retry and DLQ handling
- Cost-effective for periodic processing

**Implementation:**
1. Deploy `lambda-background-summarizer` with 2-minute CloudWatch trigger
2. Function processes all active documents in single invocation
3. Uses existing Redis and S3 infrastructure
4. Logs to CloudWatch for monitoring

#### Alternative: ECS Background Service
**Pros:**
- Always-running service
- More predictable timing
- Easier local development

**Cons:**
- Requires container orchestration
- Higher baseline costs
- More complex deployment

### 7. Message Flow Architecture

```mermaid
graph TD
    A[User sends message in Lore Modal] --> B[Agent-Lore Route]
    B --> C[Add message to Redis conversation store]
    B --> D[Proxy to /api/chat with context]
    D --> E[Stream response back to modal]
    E --> F[Add assistant response to Redis store]

    G[CloudWatch Timer - 20sec] --> H[Background Summarizer Lambda]
    H --> I[Get active background docs from Redis]
    I --> J[For each doc: get unprocessed messages]
    J --> K[Generate narrative update with OpenAI]
    K --> L[Update S3 text asset]
    L --> M[Mark messages as processed in Redis]
    L --> N[Trigger OAI File Search sync]

    O[User toggles scribe in UI] --> P[/api/chat/background-doc/toggle]
    P --> Q[Update Redis scribe state]
```

### 8. Data Persistence Strategy

#### S3 Text Assets (Primary Storage)
- **Content**: Full document markdown content
- **Metadata**: Scribe state, conversation tracking, update timestamps
- **Versioning**: S3 versioning enabled for rollback capability

#### Redis (Ephemeral State)
- **Active Documents**: Which conversations have scribe enabled
- **Message Buffer**: Unprocessed conversation turns
- **Processing State**: Last update times, message counts
- **TTL**: 7 days for conversation data, 24 hours for active sessions

#### Git (Publication Path)
- **Optional**: Scribe documents can be committed to Git for timeline publication
- **Manual**: User-initiated via existing formalization flow
- **Unchanged**: Existing webhook → OAI → LanceDB path remains intact

---

## Implementation Phases

### Phase 1: Foundation (Current Task)
- [ ] Create `ScribeRedisService` extending `RedisContextService`
- [ ] Implement background document registration/tracking
- [ ] Create conversation message capture system
- [ ] Build `/api/chat/background-doc/start` and `/toggle` endpoints

### Phase 2: Background Processing
- [ ] Implement `BackgroundSummarizer` service
- [ ] Create narrative generation prompts and logic
- [ ] Build conversation style detection
- [ ] Deploy Lambda function with CloudWatch trigger

### Phase 3: UI Integration
- [ ] Enhance `ScribeEditor` with status indicators
- [ ] Add real-time update polling
- [ ] Implement conflict resolution for concurrent edits
- [ ] Add manual refresh and sync controls

### Phase 4: Production Hardening
- [ ] Error handling and retry logic
- [ ] Monitoring and alerting
- [ ] Performance optimization
- [ ] Documentation and runbooks

---

## Success Metrics

### Functional Requirements
- [ ] Scribe creates readable narrative content from conversations
- [ ] Documents update automatically within 2-3 minutes of new messages
- [ ] Users can start/stop scribe seamlessly
- [ ] No message loss or duplicate processing
- [ ] Integration with existing OAI sync pipeline

### Performance Requirements
- [ ] Background processing completes within 60 seconds per document
- [ ] Redis operations < 100ms latency
- [ ] S3 updates complete within 5 seconds
- [ ] UI remains responsive during background updates

### Reliability Requirements
- [ ] 99.9% uptime for background processing
- [ ] Graceful degradation when services unavailable
- [ ] No data loss on service failures
- [ ] Clear error reporting and recovery paths

---

This architecture builds on existing infrastructure while adding the agentic summarization capabilities defined in the narrative lore specifications.
