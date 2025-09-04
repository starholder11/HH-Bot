import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Detect scribe intents in messages
function detectScribeIntent(message: string) {
  const startWords = /(start|begin|create|activate|enable|turn\s+on)/i;
  const stopWords = /(stop|end|pause|disable|turn\s+off|deactivate)/i;
  const scribeWords = /(scribe|background\s+doc|document|documentation)/i;

  const isStart = startWords.test(message) && scribeWords.test(message);
  const isStop = stopWords.test(message) && scribeWords.test(message);

  // Extract topic/title from message
  const topicMatch = message.match(/(?:scribe|doc|document)\s+(?:about\s+)?([^.!?]+)/i);
  const extractedTitle = topicMatch ? topicMatch[1].trim() : null;

  return { isStart, isStop, extractedTitle };
}

export async function POST(req: NextRequest) {
  try {
    const { messages, documentContext, conversationId, scribeEnabled } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return NextResponse.json({ error: 'last message must be from user' }, { status: 400 });
    }

    // Check for scribe commands first
    const scribeIntent = detectScribeIntent(lastMessage.content);

    if (scribeIntent.isStart) {
      // Handle start scribe command - call backend tool
      const finalConversationId = conversationId || `conv_${Date.now()}`;
      const title = scribeIntent.extractedTitle || 'Conversation Summary';

      try {
        // Call the backend tool directly via agent-comprehensive
        const agentBackend = process.env.AGENT_BACKEND_URL || process.env.LANCEDB_API_URL;
        if (!agentBackend) {
          throw new Error('Agent backend not configured');
        }

        const toolResponse = await fetch(`${agentBackend}/api/agent-comprehensive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `start scribe about ${title}`,
            userId: 'lore-user',
            tenantId: 'default'
          })
        });

        if (toolResponse.ok) {
          const result = await toolResponse.json();
          console.log('[agent-lore] Backend tool response:', JSON.stringify(result, null, 2));

          // Extract tool execution results from backend response
          const toolResults = result?.execution?.results?.[0] || result?.execution || result;
          const slug = toolResults?.slug || title.toLowerCase().replace(/\s+/g, '-');
          const layoutId = toolResults?.layoutId || null;
          const layoutUrl = toolResults?.layoutUrl || `/visual-search?highlight=${slug}`;

          return NextResponse.json({
            type: 'scribe_started',
            slug,
            title,
            conversationId: finalConversationId,
            message: `Started scribe for "${title}". I'll document our conversation as we chat. Switch to the Scribe tab to see the document.`,
            layoutId,
            layoutUrl
          });
        } else {
          throw new Error('Backend tool execution failed');
        }
      } catch (error) {
        console.error('[agent-lore] Start scribe failed:', error);
        return NextResponse.json({
          type: 'error',
          message: 'Sorry, I had trouble starting the scribe. Please try again.'
        });
      }
    }

    if (scribeIntent.isStop) {
      // Handle stop scribe command
      return NextResponse.json({
        type: 'scribe_stopped',
        message: 'Scribe stopped. You now have full editorial control of the document.'
      });
    }

    // Regular lore conversation - route to chat endpoint but stay in modal
    try {
      // Add document context if available
      const contextualizedMessages = documentContext
        ? [
            { role: 'system', content: `You are discussing this existing document: ${documentContext}` },
            ...messages
          ]
        : messages;

      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: lastMessage.content,
          previousResponseId: null,
          context: documentContext
        })
      });

      if (!chatResponse.ok) {
        throw new Error('Chat response failed');
      }

      // Stream the response back to the modal
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const reader = chatResponse.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (error) {
            console.error('[agent-lore] Stream error:', error);
          } finally {
            controller.close();
          }
        }
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked'
        }
      });

    } catch (error) {
      console.error('[agent-lore] Chat failed:', error);
      return NextResponse.json({
        type: 'error',
        message: 'Sorry, I had trouble responding. Please try again.'
      });
    }

  } catch (error) {
    console.error('[agent-lore] Request failed:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
