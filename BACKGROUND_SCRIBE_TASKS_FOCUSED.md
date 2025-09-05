# BACKGROUND_SCRIBE_TASKS_FOCUSED
## Implementation Task List: Enhance Existing Scribe with Real-Time Processing

---

## Current State Analysis

### What Already Exists ✅
- ✅ **Scribe Start**: `app/api/agent-lore/route.ts` creates S3 text assets with scribe metadata
- ✅ **Scribe Stop**: `agent-lore` handles stop commands
- ✅ **S3 Text Assets**: Full MediaAsset structure with `scribe_enabled`, `conversation_id`
- ✅ **Background Doc APIs**: `/api/chat/background-doc/start` and `/toggle` endpoints
- ✅ **Modal Integration**: LoreScribeModal loads documents and handles scribe commands
- ✅ **Scribe Editor**: Full document editor with save functionality

### What's Missing (The Real Gaps) 🔨
- 🔨 **Lambda Worker**: No background service to process conversations into narratives
- 🔨 **Message Capture**: Agent-lore doesn't trigger background processing
- 🔨 **Real-time Updates**: Scribe tab doesn't auto-refresh with AI updates
- 🔨 **Lambda Deployment**: No infrastructure for background summarizer

---

## Focused Implementation Plan (2-3 days)

### Task 1: Create Lambda Background Summarizer
**Priority**: Critical | **Estimated Time**: 6 hours

#### Copy Existing Lambda Structure
```bash
# Start with proven video processor pattern
cp -r lambda-video-processor lambda-background-summarizer
cd lambda-background-summarizer

# Update package.json
{
  "name": "background-summarizer",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "aws-sdk": "^2.1000.0",
    "openai": "^4.0.0"
  }
}
```

#### Main Handler Implementation
```javascript
// lambda-background-summarizer/index.js
const AWS = require('aws-sdk');
const OpenAI = require('openai');

const s3 = new AWS.S3();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async (event) => {
  const { textAssetId, userMessage, assistantResponse, conversationId } = event;
  const correlationId = event.correlationId || `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  console.log(`[${correlationId}] Processing scribe update for: ${textAssetId}`);
  
  try {
    // Load current S3 text asset
    const assetKey = `media-labeling/assets/${textAssetId}.json`;
    const response = await s3.getObject({
      Bucket: process.env.S3_BUCKET,
      Key: assetKey
    }).promise();
    
    const currentAsset = JSON.parse(response.Body.toString());
    
    // Check if scribe is still enabled
    if (!currentAsset.metadata?.scribe_enabled) {
      console.log(`[${correlationId}] Scribe disabled, skipping`);
      return { statusCode: 200, body: 'Scribe disabled' };
    }
    
    // Generate narrative update
    const conversationTurn = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;
    const updatedContent = await generateNarrativeUpdate(
      conversationTurn,
      currentAsset.content || '',
      currentAsset.title,
      correlationId
    );
    
    // Update S3 text asset
    const updatedAsset = {
      ...currentAsset,
      content: updatedContent,
      updated_at: new Date().toISOString(),
      metadata: {
        ...currentAsset.metadata,
        last_scribe_update: new Date().toISOString(),
        word_count: updatedContent.split(/\s+/).filter(w => w.length > 0).length,
        character_count: updatedContent.length
      }
    };
    
    await s3.putObject({
      Bucket: process.env.S3_BUCKET,
      Key: assetKey,
      Body: JSON.stringify(updatedAsset, null, 2),
      ContentType: 'application/json'
    }).promise();
    
    console.log(`[${correlationId}] ✅ Scribe update completed`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, correlationId })
    };
    
  } catch (error) {
    console.error(`[${correlationId}] ❌ Summarizer failed:`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message, correlationId })
    };
  }
};

async function generateNarrativeUpdate(conversationTurn, existingContent, documentTitle, correlationId) {
  console.log(`[${correlationId}] Generating narrative for: ${documentTitle}`);
  
  const systemPrompt = `You are a real-time narrative synthesizer for the Starholder universe. 
Take this conversation turn and seamlessly weave it into the existing document. 
Write in flowing, engaging prose that captures the essence of the discussion.
Maintain narrative coherence while integrating new information naturally.
Return the complete updated document.`;

  const updatePrompt = `
DOCUMENT: ${documentTitle}

CURRENT CONTENT:
${existingContent}

NEW CONVERSATION:
${conversationTurn}

Integrate this conversation naturally into the document. Return the complete updated text.`;

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

---

### Task 2: Add Lambda Trigger to Existing Agent-Lore
**Priority**: Critical | **Estimated Time**: 4 hours

#### Enhance Existing Agent-Lore Route
**File**: `app/api/agent-lore/route.ts`

**Add After Chat Response Streaming**:
```typescript
// Add this logic after the streaming response completes
if (scribeEnabled && conversationId) {
  try {
    // Find the text asset ID for this conversation
    const textAssetId = await findTextAssetByConversationId(conversationId);
    
    if (textAssetId) {
      // Trigger Lambda asynchronously (don't block chat response)
      const AWS = require('aws-sdk');
      const lambda = new AWS.Lambda({ region: process.env.AWS_REGION || 'us-east-1' });
      
      // Capture the assistant response from the stream (need helper function)
      const assistantResponse = await captureStreamResponse(chatResponse);
      
      await lambda.invoke({
        FunctionName: 'background-summarizer',
        InvocationType: 'Event', // Async
        Payload: JSON.stringify({
          textAssetId,
          userMessage: lastMessage.content,
          assistantResponse,
          conversationId,
          correlationId: generateCorrelationId()
        })
      }).promise();
      
      console.log(`[${correlationId}] ✅ Scribe Lambda triggered for ${conversationId}`);
    }
  } catch (error) {
    console.warn(`[${correlationId}] Scribe trigger failed (non-blocking):`, error);
    // Don't fail the chat if scribe fails
  }
}
```

**Helper Functions Needed**:
```typescript
// Add to agent-lore route
async function findTextAssetByConversationId(conversationId: string): Promise<string | null> {
  // Search S3 text assets for matching conversation_id
  // Implementation: scan media-assets or use existing search
}

async function captureStreamResponse(response: Response): Promise<string> {
  // Capture the full assistant response from SSE stream
  // Implementation: read stream and accumulate content deltas
}
```

---

### Task 3: Add Real-Time Updates to Scribe Editor  
**Priority**: High | **Estimated Time**: 3 hours

#### Enhance Existing ScribeEditor Component
**File**: `components/lore/LoreScribeModal.tsx`

**Add to Existing ScribeEditor**:
```typescript
// Add real-time polling to existing ScribeEditor component
const ScribeEditor = ({ documentData, scribeEnabled, onScribeToggle, onSave }) => {
  const [lastScribeUpdate, setLastScribeUpdate] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Add this polling effect to existing component
  useEffect(() => {
    if (!scribeEnabled || !documentData?.id) return;
    
    const interval = setInterval(async () => {
      try {
        setIsUpdating(true);
        
        const response = await fetch(`/api/media-assets/${documentData.id}`, {
          cache: 'no-store'
        });
        
        if (response.ok) {
          const data = await response.json();
          const lastUpdate = data.asset?.metadata?.last_scribe_update;
          
          if (lastUpdate && lastUpdate !== lastScribeUpdate) {
            console.log('📝 Scribe update detected');
            setLastScribeUpdate(lastUpdate);
            
            // Update content in existing editor
            setContent(data.asset.content || '');
          }
        }
      } catch (error) {
        console.error('Failed to check scribe updates:', error);
      } finally {
        setIsUpdating(false);
      }
    }, 5000); // Poll every 5 seconds
    
    return () => clearInterval(interval);
  }, [scribeEnabled, documentData?.id, lastScribeUpdate]);
  
  // Enhance existing header with scribe status indicator
  // Add pulsing dot when updating, green when active, gray when disabled
};
```

---

### Task 4: Deploy Lambda Function
**Priority**: High | **Estimated Time**: 2 hours

#### Deployment Script
```bash
#!/bin/bash
# scripts/deploy-background-summarizer.sh

cd lambda-background-summarizer

# Install dependencies
npm ci --only=production

# Package for Lambda
zip -r background-summarizer.zip . -x "*.git*" "*.DS_Store*"

# Deploy to AWS (using existing IAM role)
aws lambda create-function \
  --function-name background-summarizer \
  --runtime nodejs18.x \
  --role arn:aws:iam::$AWS_ACCOUNT_ID:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://background-summarizer.zip \
  --timeout 30 \
  --memory-size 1024 \
  --environment Variables='{
    "S3_BUCKET":"'$S3_BUCKET'",
    "OPENAI_API_KEY":"'$OPENAI_API_KEY'",
    "AWS_REGION":"'$AWS_REGION'"
  }' \
  || aws lambda update-function-code \
    --function-name background-summarizer \
    --zip-file fileb://background-summarizer.zip

echo "✅ Background summarizer deployed"
```

---

## Simplified Task Summary

**Total Implementation**: ~15 hours over 2-3 days

1. **Task 1** (6h): Create `lambda-background-summarizer` (copy video processor)
2. **Task 2** (4h): Add Lambda trigger to existing `agent-lore` route  
3. **Task 3** (3h): Add real-time polling to existing `ScribeEditor`
4. **Task 4** (2h): Deploy Lambda with existing infrastructure

**Key Insight**: Your existing scribe system is 80% complete! We just need:
- Background Lambda worker for conversation processing
- Trigger integration in agent-lore
- UI polling for real-time updates

This leverages all your existing infrastructure and requires minimal new code.

---

## Success Metrics

### Functional Requirements
- [ ] "start scribe" creates S3 text asset (✅ already works)
- [ ] Background Lambda processes conversation turns into narrative
- [ ] Documents update within 5 seconds of conversation
- [ ] Scribe tab shows real-time updates automatically

### Performance Requirements  
- [ ] Lambda execution <2 seconds per conversation turn
- [ ] S3 text asset updates complete within 1 second
- [ ] UI shows updates within 5 seconds of user message

This focused approach builds on your existing working scribe foundation!
