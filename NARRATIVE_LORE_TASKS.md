# NARRATIVE_LORE_TASKS
## Implementation Task List: Integrated Lore Chat + Scribe System

---

## Task Overview

This document provides an ordered implementation plan for the integrated lore chat + scribe system as defined in NARRATIVE_LORE_DOCS.md. Each task includes technical specifications and acceptance criteria.

---

## Phase 1: Core Modal & Document System

### Task 1: Extend Text Assets API with Scribe Fields
**Priority**: High | **Estimated Time**: 1-2 days

#### Technical Spec
**File**: `app/api/text-assets/route.ts`

**Changes Required**:
- Add `scribe_enabled` and `conversation_id` to YAML structure
- Update POST endpoint to accept new fields
- Ensure fields persist through save/load operations

```typescript
// Extended YAML structure
const indexDoc = {
  slug,
  title,
  date: new Date().toISOString(),
  categories: Array.isArray(categories) ? categories : [],
  source,
  status,
  scribe_enabled: scribeEnabled || false,
  conversation_id: conversationId || null
};
```

**API Changes**:
```typescript
// POST /api/text-assets (updated payload)
{
  slug: string;
  title: string;
  categories: string[];
  source: 'layout' | 'conversation';
  status: 'draft' | 'committed';
  mdx: string;
  commitOnSave?: boolean;
  scribe_enabled?: boolean;
  conversation_id?: string;
}
```

**Acceptance Criteria**:
- [ ] New fields save to YAML correctly
- [ ] Existing text assets continue working
- [ ] Fields persist through edit cycles
- [ ] API validates new field types

---

### Task 2: Create Tabbed Lore Modal Component
**Priority**: High | **Estimated Time**: 3-4 days

#### Technical Spec
**File**: `components/lore/LoreScribeModal.tsx` (new)

**Component Structure**:
```typescript
interface LoreScribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentSlug?: string;
  initialTab?: 'lore' | 'scribe';
  documentContext?: string;
}

const LoreScribeModal = ({ isOpen, onClose, documentSlug, initialTab = 'lore', documentContext }: LoreScribeModalProps) => {
  const [activeTab, setActiveTab] = useState<'lore' | 'scribe'>(initialTab);
  const [documentData, setDocumentData] = useState<TextAssetData | null>(null);
  const [scribeEnabled, setScribeEnabled] = useState(false);
  
  // Tab content components
  const renderLoreTab = () => <LoreChatInterface documentContext={documentContext} />;
  const renderScribeTab = () => <ScribeEditor documentData={documentData} scribeEnabled={scribeEnabled} />;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh]">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="lore">Lore</TabsTrigger>
            <TabsTrigger value="scribe">Scribe</TabsTrigger>
          </TabsList>
          
          <TabsContent value="lore">{renderLoreTab()}</TabsContent>
          <TabsContent value="scribe">{renderScribeTab()}</TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
```

**Integration Points**:
- Reuse existing lore chat component for Lore tab
- Embed markdown editor from layout system for Scribe tab
- Add tab switching without losing state
- Include status indicator at bottom

**Acceptance Criteria**:
- [ ] Modal opens with correct initial tab
- [ ] Tab switching preserves chat history and document state
- [ ] Lore tab functions identically to existing lore chat
- [ ] Scribe tab loads document editor correctly
- [ ] Modal closes properly and cleans up state

---

### Task 3: Implement Scribe Intent Detection
**Priority**: High | **Estimated Time**: 1-2 days

#### Technical Spec
**File**: `components/AgentChat.tsx` (or `components/lore/LoreChatInterface.tsx`)

**Intent Detection Logic**:
```typescript
const detectScribeIntent = (message: string) => {
  const startWords = /(start|begin|create|activate|enable|turn\s+on)/i;
  const stopWords = /(stop|end|pause|disable|turn\s+off|deactivate)/i;
  const scribeWords = /(scribe|background\s+doc|document|documentation)/i;
  
  const isStart = startWords.test(message) && scribeWords.test(message);
  const isStop = stopWords.test(message) && scribeWords.test(message);
  
  // Extract topic/title from message
  const topicMatch = message.match(/(?:scribe|doc|document)\s+(?:about\s+)?([^.!?]+)/i);
  const extractedTitle = topicMatch ? topicMatch[1].trim() : null;
  
  return { 
    isStart, 
    isStop, 
    extractedTitle,
    shouldSwitchToScribe: isStart
  };
};

const handleScribeCommand = async (intent: ScribeIntent, conversationId: string) => {
  if (intent.isStart) {
    // Create new text asset with scribe enabled
    const response = await fetch('/api/chat/background-doc/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        title: intent.extractedTitle || generateTitleFromContext(),
        scribe_enabled: true
      })
    });
    
    if (response.ok) {
      const { slug } = await response.json();
      // Switch to Scribe tab and load document
      switchToScribeTab(slug);
    }
  } else if (intent.isStop) {
    // Disable scribe for current document
    await toggleScribeState(currentDocumentSlug, false);
  }
};
```

**Integration**:
- Hook into existing message processing pipeline
- Add scribe command responses to agent
- Trigger tab switches and document creation

**Acceptance Criteria**:
- [ ] "start scribe" variations detected correctly
- [ ] "stop scribe" variations detected correctly
- [ ] Topic extraction works from natural language
- [ ] Commands trigger appropriate API calls
- [ ] Tab switching occurs automatically on start command

---

### Task 4: Create Scribe Document Editor Component
**Priority**: High | **Estimated Time**: 2-3 days

#### Technical Spec
**File**: `components/lore/ScribeEditor.tsx` (new)

**Component Features**:
```typescript
interface ScribeEditorProps {
  documentData: TextAssetData | null;
  scribeEnabled: boolean;
  onScribeToggle: (enabled: boolean) => void;
  onSave: (content: string) => void;
}

const ScribeEditor = ({ documentData, scribeEnabled, onScribeToggle, onSave }: ScribeEditorProps) => {
  const [content, setContent] = useState(documentData?.mdx || '');
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  
  // Header controls
  const renderHeader = () => (
    <div className="flex justify-between items-center p-4 border-b">
      <h3>{documentData?.title || 'Untitled Document'}</h3>
      <div className="flex gap-2">
        <Button 
          variant={scribeEnabled ? "destructive" : "default"}
          onClick={() => onScribeToggle(!scribeEnabled)}
        >
          {scribeEnabled ? "Stop Scribe" : "Start Scribe"}
        </Button>
        <Button onClick={() => openInLayoutEditor(documentData?.slug)}>
          Go to Layout
        </Button>
      </div>
    </div>
  );
  
  // Reuse existing markdown editor from layout system
  const renderEditor = () => (
    <MarkdownEditor
      content={content}
      onChange={setContent}
      onSave={onSave}
      autoSave={true}
      placeholder="The scribe will populate this document as your conversation continues..."
    />
  );
  
  return (
    <div className="h-full flex flex-col">
      {renderHeader()}
      {renderEditor()}
    </div>
  );
};
```

**Reuse Strategy**:
- Import markdown editor from layout text assets
- Reuse save/validation logic
- Share styling and behavior patterns

**Acceptance Criteria**:
- [ ] Editor loads existing document content
- [ ] Start/Stop Scribe button toggles correctly
- [ ] Auto-save works without interfering with AI updates
- [ ] "Go to Layout" button navigates correctly
- [ ] Editor handles empty state gracefully

---

## Phase 2: Background Summarization System

### Task 5: Create Background Document API Endpoints
**Priority**: High | **Estimated Time**: 2-3 days

#### Technical Spec
**Files**: 
- `app/api/chat/background-doc/start/route.ts` (new)
- `app/api/chat/background-doc/toggle/route.ts` (new)
- `app/api/text-assets/continue-conversation/route.ts` (new)

**Endpoint Implementations**:

```typescript
// POST /api/chat/background-doc/start
export async function POST(req: NextRequest) {
  const { conversationId, title, slug } = await req.json();
  
  const finalSlug = slug || slugify(title || 'untitled-conversation');
  
  // Create text asset with scribe enabled
  const response = await fetch('/api/text-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: finalSlug,
      title: title || 'Untitled Conversation',
      source: 'conversation',
      status: 'draft',
      scribe_enabled: true,
      conversation_id: conversationId,
      mdx: '# ' + (title || 'Untitled Conversation') + '\n\n*Scribe will populate this document as your conversation continues...*'
    })
  });
  
  if (response.ok) {
    // Register in Redis for background processing
    const redis = new RedisContextService();
    await redis.addBackgroundDoc(conversationId, finalSlug, title);
  }
  
  return NextResponse.json({ success: true, slug: finalSlug, title });
}

// POST /api/chat/background-doc/toggle
export async function POST(req: NextRequest) {
  const { slug, scribe_enabled } = await req.json();
  
  // Update YAML field via existing text assets API
  const currentDoc = await getTextAsset(slug);
  if (!currentDoc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
  
  const response = await fetch('/api/text-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...currentDoc,
      scribe_enabled
    })
  });
  
  return NextResponse.json({ success: response.ok, scribe_enabled });
}

// POST /api/text-assets/continue-conversation
export async function POST(req: NextRequest) {
  const { slug, userId } = await req.json();
  
  const doc = await getTextAsset(slug);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
  
  const conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  return NextResponse.json({
    conversationId,
    documentContext: doc.mdx,
    title: doc.title,
    scribeEnabled: doc.scribe_enabled || false
  });
}
```

**Acceptance Criteria**:
- [ ] Start endpoint creates text asset with scribe fields
- [ ] Toggle endpoint updates YAML scribe_enabled field
- [ ] Continue conversation endpoint provides document context
- [ ] Error handling for missing documents
- [ ] Integration with existing Redis context system

---

### Task 6: Implement Background Summarizer Service
**Priority**: Medium | **Estimated Time**: 4-5 days

#### Technical Spec
**File**: `services/lore/BackgroundSummarizer.ts` (new)

**Service Architecture**:
```typescript
interface ActiveBackgroundDoc {
  conversationId: string;
  slug: string;
  title: string;
  scribeEnabled: boolean;
  lastMessageCount: number;
  lastRun: string;
}

class BackgroundSummarizer {
  private redis: RedisContextService;
  private openai: OpenAI;
  
  async processActiveDocuments() {
    const activeDocs = await this.getActiveBackgroundDocs();
    
    for (const doc of activeDocs) {
      if (!doc.scribeEnabled) {
        console.log(`[${doc.slug}] Scribe disabled, skipping`);
        continue;
      }
      
      await this.updateDocument(doc);
    }
  }
  
  async updateDocument(doc: ActiveBackgroundDoc) {
    // Get new messages from current session (Redis or session store)
    const newMessages = await this.getNewMessages(doc.conversationId, doc.lastMessageCount);
    
    if (newMessages.length === 0) return;
    
    // Get current document content
    const currentDoc = await this.getTextAsset(doc.slug);
    
    // Generate updated content with adaptive style
    const updatedContent = await this.generateNarrativeContent(
      newMessages,
      currentDoc.mdx,
      currentDoc.title,
      this.detectConversationStyle(newMessages)
    );
    
    // Save via existing text assets API
    await this.saveTextAsset({
      ...currentDoc,
      mdx: updatedContent,
      scribe_enabled: true // Preserve scribe state
    });
    
    // Update tracking
    await this.updateDocumentTracking(doc.slug, {
      lastMessageCount: doc.lastMessageCount + newMessages.length,
      lastRun: new Date().toISOString()
    });
  }
  
  async generateNarrativeContent(newMessages: string[], existingContent: string, title: string, style: 'literary' | 'factual') {
    const systemPrompt = style === 'literary' 
      ? "You are a skilled narrative writer creating engaging Starholder universe content. Write in flowing, literary prose that captures the essence of the worldbuilding discussion. Create compelling narrative that reads like an article or short story."
      : "You are documenting Starholder universe information. Write clearly and factually while maintaining narrative engagement.";
    
    const prompt = `
Update this document with new conversation content:

Title: ${title}
Current Content:
${existingContent}

New Messages to Incorporate:
${newMessages.join('\n\n')}

Instructions:
- Maintain the natural article/story format
- Integrate new information seamlessly
- Keep structured metadata at the bottom
- Write in ${style} style
- Preserve existing content structure where appropriate
`;
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: style === 'literary' ? 0.8 : 0.3
    });
    
    return response.choices[0]?.message?.content || existingContent;
  }
}
```

**Deployment Options**:
1. **Lambda function** triggered every 60 seconds
2. **ECS background service** with polling loop
3. **Vercel cron** calling summarizer endpoint

**Acceptance Criteria**:
- [ ] Summarizer respects `scribe_enabled` field
- [ ] Generates natural narrative content (not rigid documentation)
- [ ] Adapts writing style based on conversation content
- [ ] Updates documents without overwriting user edits
- [ ] Handles rate limiting and error recovery
- [ ] Integrates with existing OAI sync pipeline

---

### Task 7: Add Continue Conversation Button to Text Assets
**Priority**: Medium | **Estimated Time**: 1-2 days

#### Technical Spec
**Files**: 
- Layout editor text asset display
- Timeline entry display components
- Text asset detail views

**Button Implementation**:
```typescript
const ContinueConversationButton = ({ slug, title }: { slug: string; title: string }) => {
  const handleContinueConversation = async () => {
    const response = await fetch('/api/text-assets/continue-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, userId: 'current-user' })
    });
    
    if (response.ok) {
      const { conversationId, documentContext, scribeEnabled } = await response.json();
      
      // Launch lore modal with document context
      openLoreScribeModal({
        documentSlug: slug,
        initialTab: 'lore',
        documentContext,
        conversationId
      });
    }
  };
  
  return (
    <Button onClick={handleContinueConversation} variant="outline" size="sm">
      💬 Continue Conversation
    </Button>
  );
};
```

**Integration Locations**:
- Layout editor text asset blocks
- Timeline entry cards
- Text asset detail pages
- Search results for text assets

**Acceptance Criteria**:
- [ ] Button appears on all text asset displays
- [ ] Clicking launches lore modal with document context
- [ ] Agent greets user with document-aware message
- [ ] Scribe tab loads with existing document
- [ ] Button styling matches existing design system

---

## Phase 3: Advanced Features

### Task 8: Implement Scribe Control UI
**Priority**: Medium | **Estimated Time**: 2-3 days

#### Technical Spec
**File**: `components/lore/ScribeEditor.tsx`

**Control Interface**:
```typescript
const ScribeControls = ({ scribeEnabled, onToggle, documentSlug }: ScribeControlsProps) => {
  const [isToggling, setIsToggling] = useState(false);
  
  const handleToggle = async () => {
    setIsToggling(true);
    
    try {
      const response = await fetch('/api/chat/background-doc/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: documentSlug,
          scribe_enabled: !scribeEnabled
        })
      });
      
      if (response.ok) {
        onToggle(!scribeEnabled);
        
        // Show user feedback
        showToast(
          scribeEnabled 
            ? "Scribe disabled. You have full editorial control." 
            : "Scribe activated. AI will update document as you chat."
        );
      }
    } finally {
      setIsToggling(false);
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      <Button 
        onClick={handleToggle}
        disabled={isToggling}
        variant={scribeEnabled ? "destructive" : "default"}
      >
        {scribeEnabled ? "Stop Scribe" : "Start Scribe"}
      </Button>
      
      <span className="text-sm text-muted-foreground">
        {scribeEnabled ? "AI updating document" : "Manual editing mode"}
      </span>
    </div>
  );
};
```

**Visual Indicators**:
- Clear button states (Start/Stop)
- Status text explaining current mode
- Loading states during toggle operations
- Toast notifications for state changes

**Acceptance Criteria**:
- [ ] Button toggles between Start/Stop states
- [ ] API calls update YAML correctly
- [ ] Visual feedback shows current scribe state
- [ ] Disabled state prevents AI interference
- [ ] Enabled state allows AI updates

---

### Task 9: Add Lore Agent Route for Modal Context
**Priority**: Medium | **Estimated Time**: 2-3 days

#### Technical Spec
**File**: `app/api/agent-lore/route.ts` (new)

**Purpose**: Handle lore conversations that stay in modal and integrate with scribe

**Key Differences from Workshop Agent**:
- Maintains modal context instead of closing
- Integrates with scribe commands
- Provides document-aware responses
- Handles "Continue Conversation" context loading

```typescript
export async function POST(req: NextRequest) {
  const { messages, documentContext, conversationId, scribeEnabled } = await req.json();
  
  // Extract scribe intents before processing
  const lastMessage = getLastUserMessage(messages);
  const scribeIntent = detectScribeIntent(lastMessage);
  
  if (scribeIntent.isStart || scribeIntent.isStop) {
    // Handle scribe commands directly
    return handleScribeCommand(scribeIntent, conversationId);
  }
  
  // Add document context to conversation if available
  const contextualizedMessages = documentContext 
    ? [
        { role: 'system', content: `You are discussing this existing document: ${documentContext}` },
        ...messages
      ]
    : messages;
  
  // Route to lore agent with modal-specific behavior
  const loreResponse = await callLoreAgent(contextualizedMessages, {
    stayInModal: true,
    scribeEnabled,
    conversationId
  });
  
  return loreResponse;
}
```

**Acceptance Criteria**:
- [ ] Processes scribe commands correctly
- [ ] Maintains modal context during conversations
- [ ] Integrates document context when resuming
- [ ] Provides appropriate greetings for document-initiated chats
- [ ] Handles both new conversations and continuations

---

### Task 10: Implement Background Summarizer Deployment
**Priority**: Medium | **Estimated Time**: 2-3 days

#### Technical Spec
**Deployment Option 1: Lambda Function**
```typescript
// lambda-background-summarizer/index.js
const { BackgroundSummarizer } = require('./BackgroundSummarizer');

exports.handler = async (event) => {
  const summarizer = new BackgroundSummarizer();
  
  try {
    await summarizer.processActiveDocuments();
    return { statusCode: 200, body: 'Processing complete' };
  } catch (error) {
    console.error('Summarizer failed:', error);
    return { statusCode: 500, body: error.message };
  }
};
```

**Deployment Option 2: ECS Background Service**
```typescript
// services/lore/SummarizerWorker.ts
class SummarizerWorker {
  private summarizer: BackgroundSummarizer;
  private intervalId: NodeJS.Timeout | null = null;
  
  start() {
    this.intervalId = setInterval(async () => {
      try {
        await this.summarizer.processActiveDocuments();
      } catch (error) {
        console.error('Summarizer cycle failed:', error);
      }
    }, 60000); // Every 60 seconds
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
```

**CloudWatch Events (Lambda)**:
```json
{
  "Rules": [{
    "Name": "background-summarizer-schedule",
    "ScheduleExpression": "rate(1 minute)",
    "Targets": [{
      "Id": "1",
      "Arn": "arn:aws:lambda:us-east-1:ACCOUNT:function:background-summarizer"
    }]
  }]
}
```

**Acceptance Criteria**:
- [ ] Summarizer runs on schedule (60 second intervals)
- [ ] Processes only enabled documents (`scribe_enabled: true`)
- [ ] Handles errors gracefully without crashing
- [ ] Integrates with existing OAI sync pipeline
- [ ] Provides logging and monitoring

---

## Phase 4: Polish & Integration

### Task 11: Add Document Status Indicators
**Priority**: Low | **Estimated Time**: 1 day

#### Technical Spec
- Visual indicators for scribe state in document lists
- Status badges in Scribe tab header
- Progress indicators during AI updates
- Last updated timestamps

**Acceptance Criteria**:
- [ ] Users can see scribe status at a glance
- [ ] Clear feedback during document updates
- [ ] Consistent status display across interfaces

---

### Task 12: Error Handling & Edge Cases
**Priority**: Medium | **Estimated Time**: 2-3 days

#### Technical Spec
- Handle summarizer failures gracefully
- Manage conflicts between user edits and AI updates
- Provide fallbacks when services are unavailable
- Add retry logic for failed operations

**Edge Cases**:
- User editing while summarizer runs
- Network failures during scribe operations
- Malformed conversation content
- Document corruption or missing files

**Acceptance Criteria**:
- [ ] System handles all identified edge cases
- [ ] User never loses work due to conflicts
- [ ] Clear error messages guide user actions
- [ ] Graceful degradation when services fail

---

## Implementation Priority Order

1. **Task 1**: Extend Text Assets API (foundation)
2. **Task 2**: Create Tabbed Modal (core UX)
3. **Task 3**: Implement Intent Detection (user interaction)
4. **Task 4**: Create Scribe Editor (editing interface)
5. **Task 5**: Background Doc API Endpoints (backend integration)
6. **Task 7**: Continue Conversation Buttons (bidirectional flow)
7. **Task 6**: Background Summarizer Service (AI automation)
8. **Task 9**: Lore Agent Route (modal-specific behavior)
9. **Task 10**: Summarizer Deployment (production deployment)
10. **Task 11**: Status Indicators (polish)
11. **Task 12**: Error Handling (robustness)

---

## Success Metrics

### Functional Requirements
- [ ] Users can start/stop scribe via chat commands
- [ ] Scribe creates natural narrative content from conversations
- [ ] Users can edit documents while controlling AI assistance
- [ ] Documents can launch contextual conversations
- [ ] All content syncs to OAI vector store immediately

### User Experience Requirements
- [ ] Modal tab switching is smooth and intuitive
- [ ] Scribe control is obvious and responsive
- [ ] Document content is engaging and readable
- [ ] Integration feels seamless with existing workflow
- [ ] No conversation context is lost during transitions

### Technical Requirements
- [ ] System handles concurrent users and documents
- [ ] Background processing doesn't impact UI performance
- [ ] Error states are handled gracefully
- [ ] Integration with existing systems is clean
- [ ] Monitoring and debugging capabilities are adequate

---

This task list provides a complete roadmap for implementing the integrated lore chat + scribe system as specified in NARRATIVE_LORE_DOCS.md.
