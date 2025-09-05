# Background Scribe Architecture
## Technical Specification for Agentic Conversation Summarization

---

## Executive Summary

This document defines the technical architecture for the Background Scribe system - a real-time agentic service that converts conversations into living narrative documents with call-and-response cadence. The system triggers immediately on each conversation turn, uses pure S3 storage (no Git), and provides near-instantaneous document updates for dynamic storytelling experiences.

---

## Current State Analysis

### What We Have ✅
- **LoreScribeModal**: Tabbed modal with Lore chat + Scribe document editor
- **S3 Text Assets**: UUID-based text storage with `/api/media-assets` CRUD
- **Agent-Lore Route**: Proxies to `/api/chat` with document context
- **Redis Context Service**: User sessions, workflow state, correlation tracking
- **Continue Conversation**: Button that loads S3 text content into modal

### What We Need 🔨
- **Real-Time Trigger System**: Immediate Lambda invocation on each conversation turn
- **Conversation Message Streaming**: Direct message-to-narrative conversion (no buffering)
- **High-Frequency Summarizer**: Lambda function optimized for <2 second execution
- **Pure S3 Workflow**: No Git commits, pure S3 text asset updates
- **Call-Response Cadence**: Document updates within seconds of user messages

---

## Technical Architecture

### Leveraging Existing Infrastructure

**Reuse Opportunities from AGENTIC_SYSTEM_ARCHITECTURE.md:**
- ✅ **RedisContextService**: Extend existing user context and workflow state management
- ✅ **Correlation ID System**: Use existing `corr_<timestamp>_<random>` tracing
- ✅ **SSE Streaming**: Leverage existing Server-Sent Events infrastructure
- ✅ **Tool Registry**: Add scribe tools to existing `ComprehensiveTools.ts`
- ✅ **ECS Backend**: Use existing Fargate service for summarizer orchestration
- ✅ **Lambda Workers**: Follow existing `lambda-generic-ingest` pattern

**Hybrid Architecture Decision:**
- **Real-time triggers**: Use existing SSE system to trigger summarization
- **Background processing**: Lambda for heavy OpenAI processing (like existing video processor)
- **State management**: Extend Redis context service for scribe sessions
- **UI integration**: Add scribe tools to existing `__agentApi` system

### 1. Redis Data Model Extensions (Leveraging Existing Context Service)

#### Real-Time Scribe Registry
```typescript
// Key: `scribe:active:{conversationId}`
interface ActiveScribeSession {
  conversationId: string;
  textAssetId: string;        // S3 UUID
  slug: string;               // Human-readable identifier
  title: string;
  scribeEnabled: boolean;
  lastUpdateAt: string;       // ISO timestamp
  userId: string;
  tenantId: string;
  createdAt: string;
  currentContent: string;     // Cache current document state
}

// Key: `scribe:trigger:{conversationId}:{messageId}`
interface ScribeTrigger {
  conversationId: string;
  messageId: string;
  userMessage: string;
  assistantResponse: string;
  timestamp: string;
  processed: boolean;
}
```

#### Redis Operations (Extending Existing RedisContextService)
```typescript
class ScribeRedisService extends RedisContextService {
  // Extend existing context with scribe data
  async addScribeToUserContext(userId: string, tenantId: string, session: ActiveScribeSession): Promise<void> {
    const context = await this.getUserContext(userId, tenantId);
    if (context) {
      context.sessionHistory.push({
        timestamp: new Date().toISOString(),
        eventType: 'scribe_started',
        data: { conversationId: session.conversationId, title: session.title },
        workflowId: session.conversationId
      });
      await this.updateUserContext(context);
    }
  }

  // Use existing workflow state for scribe sessions
  async createScribeWorkflow(session: ActiveScribeSession): Promise<string> {
    return await this.createWorkflowState(
      session.userId,
      session.tenantId,
      'scribe_session',
      session.conversationId,
      { scribeSession: session }
    );
  }

  // Lambda invocation using existing correlation system
  async invokeSummarizerLambda(conversationId: string, trigger: ScribeTrigger): Promise<void> {
    const correlationId = this.generateCorrelationId();

    // Use existing Lambda invoke pattern
    await this.invokeLambdaFunction('background-summarizer', {
      conversationId,
      trigger,
      correlationId
    });
  }
}
```

### 2. Scribe Tools Integration (Extending Existing Tool System)

#### Add to ComprehensiveTools.ts
```typescript
// File: services/tools/ComprehensiveTools.ts (additions)
export class ComprehensiveTools {
  // ... existing tools ...

  // Scribe management tools
  async startScribe(params: {
    title: string;
    conversationId?: string;
    userId?: string;
    tenantId?: string;
  }) {
    const correlationId = this.contextService.generateCorrelationId();
    console.log(`[${correlationId}] Starting scribe: ${params.title}`);

    // Create S3 text asset + Redis workflow state
    const response = await fetch('/api/chat/background-doc/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    return await response.json();
  }

  async toggleScribe(params: {
    conversationId: string;
    enabled: boolean;
  }) {
    // Use existing workflow state update pattern
    const workflowState = await this.contextService.getWorkflowState(params.conversationId);
    if (workflowState) {
      workflowState.context.scribeEnabled = params.enabled;
      await this.contextService.updateWorkflowState(workflowState);
    }

    return { success: true, enabled: params.enabled };
  }

  async triggerScribeUpdate(params: {
    conversationId: string;
    userMessage: string;
    assistantResponse: string;
  }) {
    const correlationId = this.contextService.generateCorrelationId();

    // Use existing Lambda invocation pattern (like video processor)
    await this.invokeLambda('background-summarizer', {
      ...params,
      correlationId,
      timestamp: new Date().toISOString()
    });

    return { triggered: true, correlationId };
  }
}
```

### 3. Background Summarizer Service (Following Lambda Worker Pattern)

#### Lambda Implementation (Like Existing Video Processor)
```typescript
// File: lambda-background-summarizer/index.js
const { getOpenAIClient } = require('./openai-client');
const { getMediaAsset, saveMediaAsset } = require('./s3-client');

exports.handler = async (event) => {
  const { conversationId, trigger, correlationId } = event;

  console.log(`[${correlationId}] Summarizer triggered for conversation: ${conversationId}`);

  try {
    // Get workflow state from Redis (existing pattern)
    const workflowState = await getWorkflowState(conversationId);
    if (!workflowState?.context?.scribeSession?.scribeEnabled) {
      console.log(`[${correlationId}] Scribe disabled for ${conversationId}, skipping`);
      return { statusCode: 200, body: 'Scribe disabled' };
    }

    const session = workflowState.context.scribeSession;

    // Load current S3 text asset (existing pattern)
    const currentAsset = await getMediaAsset(session.textAssetId);
    if (!currentAsset) {
      throw new Error(`Text asset ${session.textAssetId} not found`);
    }

    // Generate narrative update using OpenAI
    const conversationTurn = `User: ${trigger.userMessage}\n\nAssistant: ${trigger.assistantResponse}`;
    const updatedContent = await generateRealtimeUpdate(
      conversationTurn,
      currentAsset.content || '',
      session.title,
      correlationId
    );

    // Update S3 text asset (existing pattern)
    const updatedAsset = {
      ...currentAsset,
      content: updatedContent,
      updated_at: new Date().toISOString(),
      metadata: {
        ...currentAsset.metadata,
        last_scribe_update: new Date().toISOString(),
        last_message_id: trigger.messageId,
        correlation_id: correlationId
      }
    };

    await saveMediaAsset(session.textAssetId, updatedAsset);

    // Update workflow state (existing pattern)
    workflowState.context.scribeSession.lastUpdateAt = new Date().toISOString();
    await updateWorkflowState(workflowState);

    console.log(`[${correlationId}] ✅ Real-time scribe update completed for ${session.slug}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        updated: session.slug,
        correlationId
      })
    };

  } catch (error) {
    console.error(`[${correlationId}] ❌ Summarizer failed:`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        correlationId
      })
    };
  }
};

async function generateRealtimeUpdate(conversationTurn, existingContent, documentTitle, correlationId) {
  console.log(`[${correlationId}] Generating narrative update for: ${documentTitle}`);

  const openai = getOpenAIClient();

  const systemPrompt = `You are a real-time narrative synthesizer for the Starholder universe.
Take this single conversation turn and seamlessly weave it into the existing document.
Write in flowing, engaging prose that captures the essence of the discussion.
Maintain narrative coherence while integrating new information naturally.
Respond with the complete updated document.`;

  const updatePrompt = `
DOCUMENT TITLE: ${documentTitle}

CURRENT DOCUMENT:
${existingContent}

NEW CONVERSATION TURN TO INTEGRATE:
${conversationTurn}

TASK: Seamlessly integrate this conversation turn into the document. Maintain the flow and add new insights naturally. Return the complete updated document.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: updatePrompt }
    ],
    temperature: 0.7,
    max_tokens: 8000
  });

  return response.choices[0]?.message?.content || existingContent;
}
```

### 4. Agent-Lore Integration (Using Existing SSE + Tool System)

#### Enhanced Agent-Lore Route (Following Existing Agent Pattern)
```typescript
// File: app/api/agent-lore/route.ts (enhanced with existing patterns)

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  console.log(`[${correlationId}] Agent-lore request received`);

  try {
    const { messages, documentContext, conversationId, scribeEnabled } = await req.json();

    // Use existing scribe intent detection
    const lastMessage = messages[messages.length - 1];
    const scribeIntent = detectScribeIntent(lastMessage.content);

    if (scribeIntent.isStart) {
      // Use existing tool system for scribe start
      const tools = new ComprehensiveTools(contextService);
      const result = await tools.startScribe({
        title: scribeIntent.extractedTitle || 'Conversation Summary',
        conversationId: conversationId || correlationId,
        userId: 'current-user',
        tenantId: 'default'
      });

      return NextResponse.json({
        type: 'scribe_started',
        ...result,
        correlationId
      });
    }

    // Regular conversation - proxy to chat with context
    const chatResponse = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: lastMessage.content,
        context: documentContext,
        correlationId
      })
    });

    // After successful response, trigger scribe update if enabled
    if (scribeEnabled && conversationId) {
      // Use existing tool system to trigger Lambda
      const tools = new ComprehensiveTools(contextService);
      await tools.triggerScribeUpdate({
        conversationId,
        userMessage: lastMessage.content,
        assistantResponse: '', // Will be populated from stream
        correlationId
      });
    }

    // Return existing SSE stream
    return new Response(chatResponse.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Correlation-ID': correlationId
      }
    });

  } catch (error) {
    console.error(`[${correlationId}] Agent-lore failed:`, error);
    return NextResponse.json({
      type: 'error',
      message: 'Sorry, I had trouble responding. Please try again.',
      correlationId
    });
  }
}

    const trigger = await this.redis.getTrigger(conversationId, messageId);
    if (!trigger || trigger.processed) return;

    try {
      await this.updateDocumentRealtime(session, trigger);
      await this.redis.markTriggerProcessed(conversationId, messageId);
    } catch (error) {
      console.error(`[Summarizer] Failed real-time update for ${session.slug}:`, error);
      throw error; // Lambda will retry
    }
  }

  // Real-time document update - processes single conversation turn immediately
  async updateDocumentRealtime(session: ActiveScribeSession, trigger: ScribeTrigger): Promise<void> {
    console.log(`[Summarizer] Real-time update for ${session.slug}: ${trigger.messageId}`);

    // Load current document content from S3
    const currentAsset = await getMediaAsset(session.textAssetId);
    if (!currentAsset) {
      throw new Error(`Text asset ${session.textAssetId} not found`);
    }

    // Generate immediate narrative update from this conversation turn
    const conversationTurn = `User: ${trigger.userMessage}\n\nAssistant: ${trigger.assistantResponse}`;
    const updatedContent = await this.generateRealtimeUpdate(
      conversationTurn,
      currentAsset.content || '',
      session.title
    );

    // Update S3 text asset immediately
    const updatedAsset = {
      ...currentAsset,
      content: updatedContent,
      updated_at: new Date().toISOString(),
      metadata: {
        ...currentAsset.metadata,
        last_scribe_update: new Date().toISOString(),
        last_message_id: trigger.messageId,
        scribe_version: 'realtime'
      }
    };

    await saveMediaAsset(session.textAssetId, updatedAsset);

    // Update Redis session cache
    await this.redis.updateScribeSession(session.conversationId, {
      currentContent: updatedContent,
      lastUpdateAt: new Date().toISOString()
    });

    console.log(`[Summarizer] Real-time updated ${session.slug} in <2s`);
  }
}
```

#### Narrative Generation Strategy
```typescript
// Real-time single-turn processing
async generateRealtimeUpdate(
  conversationTurn: string,
  existingContent: string,
  documentTitle: string
): Promise<string> {
  const systemPrompt = `You are a real-time narrative synthesizer for the Starholder universe.
Take this single conversation turn and seamlessly weave it into the existing document.
Write in flowing, engaging prose that captures the essence of the discussion.
Maintain narrative coherence while integrating new information naturally.
Respond with the complete updated document.`;

  const updatePrompt = `
DOCUMENT TITLE: ${documentTitle}

CURRENT DOCUMENT:
${existingContent}

NEW CONVERSATION TURN TO INTEGRATE:
${conversationTurn}

TASK: Seamlessly integrate this conversation turn into the document. Maintain the flow and add new insights naturally. Return the complete updated document.
`;

  const response = await this.openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: updatePrompt }
    ],
    temperature: 0.7,
    max_tokens: 8000
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

  start(intervalMs: number = 5000) { // 5 seconds for real-time feel
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

#### Real-Time Lambda Architecture
**Approach:**
- **Immediate invocation** on each conversation turn (not periodic polling)
- **Event-driven triggers** from agent-lore route
- **Sub-2 second execution** for call-and-response cadence
- **Pure S3 workflow** - no Git commits, no webhook dependencies

**Implementation:**
1. Deploy `lambda-background-summarizer` with async invocation capability
2. Agent-lore route triggers Lambda immediately after each conversation turn
3. Lambda processes single conversation turn and updates S3 text asset
4. UI sees updates within 3-5 seconds of user message

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

    G[Agent-Lore Route] --> H[Trigger Lambda Immediately]
    H --> I[Background Summarizer Lambda]
    I --> J[Process single conversation turn]
    J --> K[Generate narrative update with OpenAI]
    K --> L[Update S3 text asset immediately]
    L --> M[Update Redis session cache]
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

#### No Git Dependencies
- **Pure S3 workflow**: Scribe documents live entirely in S3 text assets
- **No commits**: Real-time updates bypass Git entirely for speed
- **OAI-only sync**: Direct S3 → OAI File Search integration

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
- [ ] Real-time processing completes within 2-3 seconds per conversation turn
- [ ] Redis operations < 50ms latency
- [ ] S3 updates complete within 1 second
- [ ] Document updates visible in UI within 5 seconds of user message

### Reliability Requirements
- [ ] 99.9% uptime for background processing
- [ ] Graceful degradation when services unavailable
- [ ] No data loss on service failures
- [ ] Clear error reporting and recovery paths

---

## Reuse Strategy Summary

**Maximum Infrastructure Reuse:**
- ✅ **Redis Workflow State**: Use existing `workflow:<executionId>` pattern for scribe sessions
- ✅ **Correlation ID Tracing**: Follow existing `corr_<timestamp>_<random>` system
- ✅ **Lambda Worker Pattern**: Copy `lambda-video-processor` structure for summarizer
- ✅ **Tool System Integration**: Add scribe tools to existing `ComprehensiveTools.ts`
- ✅ **SSE Streaming**: Leverage existing agent streaming infrastructure
- ✅ **Error Handling**: Use existing circuit breaker and retry patterns
- ✅ **UI Patterns**: Follow existing `__agentApi` handler conventions

**Net New Components (Minimal):**
- 🔨 **Lambda Function**: `lambda-background-summarizer` (copy existing structure)
- 🔨 **API Endpoints**: `/api/chat/background-doc/*` (simple CRUD)
- 🔨 **Scribe Tools**: Add 3 methods to existing `ComprehensiveTools.ts`

**Implementation Approach:**
1. **Extend existing services** rather than create parallel systems
2. **Follow established patterns** for consistency and reliability
3. **Reuse battle-tested infrastructure** for Redis, Lambda, S3, correlation tracing
4. **Minimize new code** by copying proven patterns like video processor

This architecture builds on existing infrastructure while adding the agentic summarization capabilities defined in the narrative lore specifications.
