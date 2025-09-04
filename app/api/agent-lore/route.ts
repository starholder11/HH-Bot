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
            message: `Execute tool: createBackgroundDocDraft with title="${title}" conversationId="${finalConversationId}"`,
            userId: 'lore-user',
            tenantId: 'default'
          })
        });

        if (toolResponse.ok) {
          const result = await toolResponse.json();

          // Try to create a layout immediately if backend tool didn't return one
          let layoutId = result?.execution?.artifacts?.layoutId || result?.layoutId || null;
          let layoutUrl = result?.execution?.artifacts?.layoutUrl || result?.layoutUrl || null;
          const slug = title.toLowerCase().replace(/\s+/g, '-');

          if (!layoutId) {
            try {
              const layoutResp = await fetch(`${process.env.PUBLIC_BASE_URL || ''}/api/layouts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: `${title} - Layout`,
                  description: `Layout for ${title}`,
                  layout_data: {
                    cellSize: 20,
                    designSize: { width: 1200, height: 800 },
                    items: [
                      {
                        id: `text_${Date.now()}`,
                        type: 'content_ref',
                        contentType: 'text',
                        refId: `text_timeline/${slug}`,
                        x: 0, y: 0, w: 640, h: 480,
                        nx: 0, ny: 0, nw: 640/1200, nh: 480/800
                      }
                    ]
                  }
                })
              });
              if (layoutResp.ok) {
                const lr = await layoutResp.json();
                layoutId = lr.id;
                layoutUrl = `/layout-editor/${layoutId}`;
              }
            } catch (e) {
              console.warn('[agent-lore] Local layout creation failed, falling back to highlight URL');
            }
          }

          return NextResponse.json({
            type: 'scribe_started',
            slug,
            title,
            conversationId: finalConversationId,
            message: `Started scribe for "${title}". I'll document our conversation as we chat. Switch to the Scribe tab to see the document.`,
            layoutId: layoutId || null,
            layoutUrl: layoutUrl || `/visual-search?highlight=${slug}`
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
