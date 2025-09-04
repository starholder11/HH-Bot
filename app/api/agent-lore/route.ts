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
      // Handle start scribe command - implement directly since backend tool isn't working
      const finalConversationId = conversationId || `conv_${Date.now()}`;
      const baseTitle = (scribeIntent.extractedTitle && String(scribeIntent.extractedTitle).trim()) || 'Conversation Summary';
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 6);
      const title = `${baseTitle} ${ts}-${rand}`;
      const slug = baseTitle
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-') + `-${ts}-${rand}`;

      console.log('[agent-lore] Starting scribe directly:', { title, slug, conversationId: finalConversationId });

      try {
        // Create text asset via enqueue (same as backend tool would do)
        const indexDoc = {
          slug,
          title,
          date: new Date().toISOString(),
          categories: ['lore', 'conversation'],
          source: 'conversation',
          status: 'draft',
          scribe_enabled: true,
          conversation_id: finalConversationId
        };

        const indexYaml = `slug: ${slug}
title: "${title}"
date: ${indexDoc.date}
categories:
  - lore
  - conversation
source: conversation
status: draft
scribe_enabled: true
conversation_id: ${finalConversationId}`;

        const mdx = `# ${title}\n\n*The scribe will populate this document as your conversation continues...*`;

        // Enqueue to backend
        const agentBackend = process.env.AGENT_BACKEND_URL || process.env.LANCEDB_API_URL;
        let enqueued = false;

        if (agentBackend) {
          try {
            const enqueueResponse = await Promise.race([
              fetch(`${agentBackend}/api/text-assets/enqueue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  slug,
                  indexYaml,
                  mdx,
                  scribe_enabled: true,
                  conversation_id: finalConversationId
                })
              }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
            ]) as Response;

            if (enqueueResponse.ok) {
              const result = await enqueueResponse.json();
              enqueued = !!result.enqueued;
            }
          } catch (err) {
            console.warn('[agent-lore] Enqueue failed (non-blocking):', (err as Error)?.message);
          }
        }

        // Create layout directly
        let layoutId = null;
        let layoutUrl = `/visual-search?highlight=${slug}`;

        try {
          const layoutResponse = await fetch(`${process.env.PUBLIC_BASE_URL || ''}/api/layouts`, {
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
                    snippet: title,
                    title: title,
                    x: 0, y: 0, w: 640, h: 480,
                    nx: 0, ny: 0, nw: 640/1200, nh: 480/800,
                    transform: {}
                  }
                ]
              }
            })
          });

          if (layoutResponse.ok) {
            const layoutResult = await layoutResponse.json();
            layoutId = layoutResult.id;
            layoutUrl = `/layout-editor/${layoutId}`;
            console.log('[agent-lore] Layout created:', { layoutId, layoutUrl });
          }
        } catch (layoutError) {
          console.warn('[agent-lore] Layout creation failed (non-blocking):', layoutError);
        }

        return NextResponse.json({
          type: 'scribe_started',
          slug,
          title,
          conversationId: finalConversationId,
          message: `Started scribe for "${title}". I'll document our conversation as we chat. Switch to the Scribe tab to see the document.`,
          layoutId,
          layoutUrl
        });

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
