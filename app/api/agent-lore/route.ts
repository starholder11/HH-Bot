import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { saveMediaAsset } from '@/lib/media-storage';

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
  console.log('🔍 [AGENT-LORE] POST request received');
  try {
    const { messages, documentContext, conversationId, scribeEnabled } = await req.json();
    console.log('🔍 [AGENT-LORE] Request body parsed:', {
      messagesLength: messages?.length,
      conversationId,
      scribeEnabled,
      lastMessage: messages?.[messages.length - 1]?.content
    });

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return NextResponse.json({ error: 'last message must be from user' }, { status: 400 });
    }

    // Check for scribe commands first
    const scribeIntent = detectScribeIntent(lastMessage.content);
    console.log('🔍 [AGENT-LORE] Scribe intent detected:', scribeIntent);

    if (scribeIntent.isStart) {
      console.log('🔍 [AGENT-LORE] Processing scribe start command');
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

        // Create S3 text asset directly
        const textAssetId = randomUUID();
        const s3TextAsset = {
          id: textAssetId,
          media_type: 'text',
          title: title,
          content: mdx,
          date: new Date().toISOString(),
          filename: `${slug}.md`,
          s3_url: `media-labeling/assets/${textAssetId}.json`,
          cloudflare_url: '',
          description: `Text asset: ${title}`,
          metadata: {
            slug: slug,
            source: 'conversation',
            status: 'draft',
            categories: ['lore', 'conversation'],
            scribe_enabled: true,
            conversation_id: finalConversationId,
            word_count: mdx.split(/\s+/).filter(word => word.length > 0).length,
            character_count: mdx.length,
            reading_time_minutes: Math.ceil(mdx.split(/\s+/).filter(word => word.length > 0).length / 200),
            language: 'en',
            migrated_from_git: false,
          },
          ai_labels: {
            scenes: [],
            objects: [],
            style: [],
            mood: [],
            themes: [],
            confidence_scores: {},
          },
          manual_labels: {
            scenes: [],
            objects: [],
            style: [],
            mood: [],
            themes: [],
            custom_tags: [],
            topics: [],
            genres: [],
            content_type: [],
          },
          processing_status: {
            upload: 'completed',
            metadata_extraction: 'completed',
            ai_labeling: 'not_started',
            manual_review: 'pending',
            content_analysis: 'pending',
            search_indexing: 'pending',
          },
          timestamps: {
            uploaded: new Date().toISOString(),
            metadata_extracted: new Date().toISOString(),
            labeled_ai: null,
            labeled_reviewed: null,
          },
          labeling_complete: false,
          project_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Save S3 text asset directly (no HTTP call to self)
        console.log('[agent-lore] Creating S3 text asset:', { id: textAssetId, slug, title });

        await saveMediaAsset(textAssetId, s3TextAsset as any);

        console.log('🔍 [AGENT-LORE] S3 text asset saved successfully via direct call');

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
                    refId: textAssetId, // Use UUID for S3 text asset
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
          id: textAssetId, // Include UUID for S3 text asset
          slug,
          title,
          conversationId: finalConversationId,
          message: `Started scribe for "${title}". I'll document our conversation as we chat. Switch to the Scribe tab to see the document.`,
          layoutId,
          layoutUrl
        });

      } catch (error) {
        console.error('🔍 [AGENT-LORE] Start scribe failed with error:', error);
        console.error('🔍 [AGENT-LORE] Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        return NextResponse.json({
          type: 'error',
          message: `Sorry, I had trouble starting the scribe: ${error instanceof Error ? error.message : 'Unknown error'}`
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

      // Use absolute URL for server-to-server call to avoid relative path issues in prod
      const baseUrl = (() => {
        try {
          const u = new URL(req.url);
          return `${u.protocol}//${u.host}`;
        } catch {
          return '';
        }
      })();
      const chatResponse = await fetch(`${baseUrl}/api/chat`, {
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

      // Wrap and forward upstream SSE, then append an explicit done signal
      const readable = new ReadableStream({
        async start(controller) {
          const reader = chatResponse.body?.getReader();
          if (!reader) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
            controller.close();
            return;
          }

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
          } catch (err) {
            console.warn('[agent-lore] upstream stream error, ending gracefully:', err);
          } finally {
            try {
              controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
            } catch {}
            controller.close();
          }
        }
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
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
