# NARRATIVE_LORE_DOCS
## Product Specification: Integrated Lore Chat & Background Document Creation

---

## Executive Summary

Narrative Lore Docs creates a seamless experience where users can have rich lore conversations while simultaneously building living documents that capture and formalize their worldbuilding. The system integrates a tabbed modal interface that combines the existing lore agent chat with a real-time document editor ("Scribe"), enabling users to converse naturally about Starholder lore while watching their ideas crystallize into structured timeline entries.

This specification builds on the existing text assets foundation and lore agent architecture, adding intelligent background summarization and bidirectional flow between conversation and documentation.

---

## Vision & Product Objectives

### Primary Vision
Transform the friction between creative conversation and formal documentation into a fluid, integrated experience where worldbuilding conversations naturally evolve into structured timeline entries without breaking creative flow.

### Core Product Objectives
1. **Seamless Conversation-to-Document Flow**: Enable natural lore discussions to automatically generate structured documentation
2. **Live Document Creation**: Provide real-time visibility into background document generation during conversations
3. **Bidirectional Context**: Allow existing documents to seed new conversations and new conversations to enhance existing documents
4. **Integrated Editing**: Combine AI summarization with human editing in a single, intuitive interface
5. **Timeline Integration**: Ensure all generated documents flow seamlessly into the existing timeline publication system

---

## User Experience Design

### The Integrated Lore Modal

#### Modal Structure
- **Two-tab interface**: "Lore" (conversation) and "Scribe" (document)
- **Tab switching**: Toggle between views without losing chat history or document state
- **Consistent sizing**: Each tab uses full modal space, no side-by-side layout
- **Status indicator**: Bottom field shows "Lore Agent", "Workshop", or processing status

#### Tab Behaviors

**Lore Tab (Default)**
- Standard lore agent conversation interface
- Chat history persists when switching to Scribe
- Agent responses appear here regardless of active tab
- Status updates for background processing show in bottom indicator

**Scribe Tab**
- Full markdown document editor (reuses layout text asset editor)
- "Start Scribe" / "Stop Scribe" button controls background summarization
- Auto-save with explicit Save button option
- "Go to Layout" button to open asset in layout editor (closes modal)
- Live updates from background summarizer (when enabled)

### User Journey Flows

#### Flow 1: Conversation-Initiated Documentation
```
User opens lore chat → discusses Denmark in Starholder universe
User: "start scribe about Danish futures"
Agent: creates draft text asset, sets scribe_enabled: true in YAML
Modal: Scribe tab becomes active, shows document with "Stop Scribe" button
Summarizer: begins populating document with structured content from chat
User: can switch between tabs to continue conversation or edit document
User: clicks "Stop Scribe" → sets scribe_enabled: false, gains full editorial control
```

#### Flow 2: Document-Initiated Conversation
```
User viewing Denmark text asset → clicks "Continue Conversation"
Modal: opens on Lore tab with greeting about Denmark
Agent: "I see you want to keep talking about Denmark. Should I continue adding to the document as we chat?"
User: responds yes/no, agent sets scribe_enabled accordingly in YAML
Scribe tab: available with existing document loaded
Button state: shows "Start Scribe" if disabled, "Stop Scribe" if enabled
User: can toggle scribe state, which updates YAML and controls summarizer behavior
```

#### Flow 3: Live Document Refinement
```
User in active lore conversation with background doc running (scribe_enabled: true)
User switches to Scribe tab → sees AI-generated structure
User clicks "Stop Scribe" → gains full editorial control, sets scribe_enabled: false
User edits sections, adds details, refines organization without AI interference
User clicks "Start Scribe" → re-enables AI updates, summarizer resumes from current state
Result: user-controlled human-AI collaborative document creation
```

---

## Technical Architecture

### Modal Component Integration

#### Lore Modal Enhancement
**File**: `components/AgentChat.tsx` (or new dedicated component)

**New Props**:
- `documentSlug?: string` - Links to existing text asset
- `enableScribe?: boolean` - Shows Scribe tab
- `initialTab?: 'lore' | 'scribe'` - Starting tab

**Tab Management**:
```typescript
const [activeTab, setActiveTab] = useState<'lore' | 'scribe'>('lore');
const [documentData, setDocumentData] = useState<{
  slug?: string;
  title?: string;
  content?: string;
  isActive?: boolean;
}>({});
```

#### Document Editor Integration
- Embed existing markdown editor from layout text assets
- Share save/validation logic with layout system
- Add Start/Stop summarization controls
- Include "Go to Layout" navigation

### Document YAML Structure

#### Extended Metadata Fields
```yaml
slug: danish-futures
title: Danish Futures in Starholder
date: 2025-01-15T10:30:00.000Z
categories: [starholder, lore, worldbuilding]
source: conversation
status: draft
scribe_enabled: true  # Controls background summarization
conversation_id: conv_123  # Links to chat session
```

**Key Fields**:
- `scribe_enabled`: Controls whether background summarizer updates this document
- `conversation_id`: Links document to specific chat session for context

### Background Summarization System

#### Summarizer Service
**Implementation**: Lambda function or ECS background service
**Trigger**: Polling every 60 seconds for active background docs
**Rate Limiting**: Minimum 30 seconds between updates per document

**Core Logic**:
```typescript
interface BackgroundDoc {
  conversationId: string;
  slug: string;
  title: string;
  scribeEnabled: boolean;  // Read from YAML scribe_enabled field
  lastMessageCount: number;
  lastRun: string;
}

async function processSummarization(doc: BackgroundDoc) {
  // Check if scribe is enabled in document YAML
  const currentDoc = await getTextAsset(doc.slug);
  if (!currentDoc.scribe_enabled) {
    console.log(`[${doc.slug}] Scribe disabled, skipping summarization`);
    return;
  }

  // Get new messages since lastMessageCount
  const newMessages = await getConversationMessages(doc.conversationId, doc.lastMessageCount);

  if (newMessages.length === 0) return;

  // Summarize into structured MDX
  const updatedContent = await generateStructuredSummary(newMessages, existingContent);

  // Save via existing text assets API (preserves scribe_enabled field)
  await saveTextAsset({
    slug: doc.slug,
    title: doc.title,
    mdx: updatedContent,
    source: 'conversation',
    status: 'draft',
    scribe_enabled: true,
    conversation_id: doc.conversationId
  });

  // Update tracking
  await updateBackgroundDocState(doc.slug, {
    lastMessageCount: doc.lastMessageCount + newMessages.length,
    lastRun: new Date().toISOString()
  });
}
```

#### MDX Document Structure
**Natural article/story format with structured metadata at the end**:

```markdown
# [Document Title]

[Natural flowing narrative content that reads like an article or short story,
capturing the essence and details of the conversation in an engaging,
readable format. This is the primary content that users will read and
that represents the worldbuilding discussion.]

[Multiple paragraphs that tell the story, describe the world, explore
the characters and themes in a natural, literary style. The scribe
writes this as compelling narrative prose, not as bullet points or
formal documentation.]

---

## Metadata & References

### Key Entities
- **Characters**: [Names and brief roles]
- **Locations**: [Places mentioned]
- **Concepts**: [Thematic elements]

### Themes
[Brief list of major thematic elements]

### Timeline Connections
[Links to related entries or references]

### Conversation Notes
*Last updated: [timestamp] • Messages processed: [count]*
```

**Structure Philosophy**:
- **Primary content**: Natural, flowing narrative that captures the worldbuilding discussion
- **Supporting metadata**: Structured information relegated to the bottom
- **Literary style**: Reads like a compelling article or short story, not documentation

### Agent Command Integration

#### Intent Detection
**File**: `components/AgentChat.tsx`

```typescript
const detectScribeIntent = (message: string) => {
  const startPattern = /\b(start|begin|create|activate|enable|turn\s+on)\s+(scribe|background\s+doc|document|documentation)\b/i;
  const stopPattern = /\b(stop|end|pause|disable|turn\s+off|deactivate)\s+(scribe|background\s+doc|document|documentation)\b/i;

  return {
    isStart: startPattern.test(message),
    isStop: stopPattern.test(message),
    extractedTitle: extractTitleFromMessage(message)
  };
};
```

#### New Agent Route
**File**: `app/api/agent-lore/route.ts` (new)

**Purpose**: Handle lore conversations that should stay in modal and activate Scribe
**Behavior**:
- Process lore requests without closing modal
- Activate Scribe tab when background doc commands detected
- Maintain conversation context across tab switches

### API Endpoints

#### Background Document Management
```typescript
// Start background documentation
POST /api/chat/background-doc/start
{
  "conversationId": "conv_123",
  "slug": "danish-futures", // auto-generated or extracted
  "title": "Danish Futures in Starholder"
}
// Response: creates text asset with scribe_enabled: true

// Toggle scribe state
POST /api/chat/background-doc/toggle
{
  "slug": "danish-futures",
  "scribe_enabled": false  // true to start, false to stop
}
// Response: updates YAML scribe_enabled field, affects summarizer behavior

// Get background doc status
GET /api/chat/background-doc/status?conversationId=conv_123
{
  "active": true,
  "slug": "danish-futures",
  "title": "Danish Futures in Starholder",
  "scribe_enabled": false,
  "lastUpdated": "2025-01-15T10:30:00Z",
  "messageCount": 12
}
```

#### Document-Conversation Bridge
```typescript
// Launch conversation from document
POST /api/text-assets/continue-conversation
{
  "slug": "danish-futures",
  "userId": "user_123"
}
// Returns conversationId and modal launch parameters
```

---

## Conversational Commands (Fuzzy Intent Matching)

### Start Scribe Commands
**Accepted variations**:
- `"start scribe"` / `"start scribe about [topic]"`
- `"activate scribe"` / `"activate documentation"`
- `"enable scribe"` / `"enable background doc"`
- `"turn on scribe"` / `"begin documentation"`
- `"create background doc about [topic]"`

### Stop Scribe Commands
**Accepted variations**:
- `"stop scribe"` / `"stop documentation"`
- `"disable scribe"` / `"deactivate scribe"`
- `"turn off scribe"` / `"end documentation"`
- `"pause scribe"` / `"pause background doc"`

### Implementation Pattern
```typescript
const detectScribeIntent = (message: string) => {
  const startWords = /(start|begin|create|activate|enable|turn\s+on)/i;
  const stopWords = /(stop|end|pause|disable|turn\s+off|deactivate)/i;
  const scribeWords = /(scribe|background\s+doc|document|documentation)/i;

  const isStart = startWords.test(message) && scribeWords.test(message);
  const isStop = stopWords.test(message) && scribeWords.test(message);

  return { isStart, isStop, extractedTitle: extractTitleFromMessage(message) };
};
```

---

## Technical Implementation Details

### Summarizer Writing Style
**Adaptive style based on conversation content**:
- **Default**: Literary narrative style (engaging storytelling, third person)
- **Responsive**: Adapts to conversation directives and topic nature
- **Factual mode**: When conversation is analytical or technical
- **Narrative mode**: When conversation is creative or worldbuilding-focused
- **Behavior**: Like a modern LLM - context-aware and style-responsive

### Conversation Tracking (Phase 1 Limitation)
**Current approach**:
- **No conversation persistence** - conversations are not stored long-term
- **Document-as-context**: When resuming, lore agent reads the existing text asset for full context
- **Session-only tracking**: Scribe only works within active chat sessions
- **Future enhancement**: Full conversation persistence marked as TODO for later phases

**Implementation Impact**:
- Scribe summarization works only during active chat sessions
- When user clicks "Continue Conversation", agent gets context from document content, not chat history
- This keeps implementation simple while providing core functionality

---

## Implementation Priority & Next Steps

This design provides a complete, user-controlled system for conversation-document integration that builds on existing infrastructure while adding powerful new capabilities for worldbuilding and lore development.

**Ready for implementation** - all architectural questions resolved through UX design decisions.
