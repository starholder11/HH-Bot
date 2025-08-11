import { NextRequest } from 'next/server';
import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// Comprehensive UI Control Tools
const tools = {
  searchUnified: tool({
    description: 'Search and display content in Results section - use for ANY content request (images, videos, audio, "show me", "find", "pull up")',
    parameters: z.object({
      query: z.string(),
    }),
    execute: async ({ query }) => {
      const url = `${process.env.PUBLIC_API_BASE_URL || ''}/api/unified-search?q=${encodeURIComponent(query)}&limit=100`;
      const res = await fetch(url || `/api/unified-search?q=${encodeURIComponent(query)}&limit=50`, { method: 'GET' });
      if (!res.ok) throw new Error(`Unified search failed: ${res.status}`);
      const json = await res.json();
      return { action: 'showResults', payload: json };
    }
  }),
  
  pinToCanvas: tool({
    description: 'Pin selected content to canvas for reference or generation',
    parameters: z.object({
      contentId: z.string(),
      type: z.string(),
      url: z.string(),
      title: z.string().optional(),
    }),
    execute: async ({ contentId, type, url, title }) => {
      return { 
        action: 'pinToCanvas', 
        payload: { contentId, type, url, title: title || 'Pinned Content' }
      };
    }
  }),

  prepareGenerate: tool({
    description: 'Set up media generation with parameters (images, videos, audio)',
    parameters: z.object({
      type: z.enum(['image', 'video', 'audio']),
      prompt: z.string(),
      model: z.string().optional(),
      refs: z.array(z.string()).optional(),
    }),
    execute: async ({ type, prompt, model, refs }) => {
      return { 
        action: 'prepareGenerate', 
        payload: { type, prompt, model: model || 'default', refs: refs || [] }
      };
    }
  }),

  agentStatus: tool({
    description: 'Get current generation status and running processes',
    parameters: z.object({}),
    execute: async () => {
      try {
        const res = await fetch(`${process.env.PUBLIC_API_BASE_URL || ''}/api/agent/status` || '/api/agent/status', { method: 'GET' });
        if (!res.ok) throw new Error('Status fetch failed');
        const status = await res.json();
        return { action: 'agentStatus', payload: status };
      } catch (error) {
        return { action: 'agentStatus', payload: { status: 'idle', error: error instanceof Error ? error.message : String(error) } };
      }
    }
  }),

  chat: tool({
    description: 'Handle greetings and general conversation',
    parameters: z.object({
      message: z.string(),
    }),
    execute: async ({ message }) => {
      // Simple greeting responses that will be displayed as normal text
      const greetings = ["Hey! Ready to help you find content or create something awesome!", "Hello! What can I help you discover today?", "Hi there! Looking for some media or want to generate something?"];
      const response = greetings[Math.floor(Math.random() * greetings.length)];
      return response; // Return plain string for normal chat display
    }
  }),

  showOutput: tool({
    description: 'Display generation output in Output section',
    parameters: z.object({
      content: z.string(),
      type: z.string(),
      metadata: z.object({}).optional(),
    }),
    execute: async ({ content, type, metadata }) => {
      return { 
        action: 'showOutput', 
        payload: { content, type, metadata: metadata || {} }
      };
    }
  }),

};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Updated: Working agent with proper tool calling

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  // Server-side intent routing to guarantee correct tool usage
  const lastUserMessage = Array.isArray(messages)
    ? [...messages].reverse().find((m: any) => m?.role === 'user')?.content ?? ''
    : '';
  const lastText = typeof lastUserMessage === 'string' ? lastUserMessage : '';
  const searchIntentRegex = /\b(search|find|show|pull\s*up|dig\s*up|pics?|pictures?|images?|photos?|media|video|audio|look.*up|gimme|give me)\b/i;
  const greetingIntentRegex = /\b(hi|hello|hey|yo|sup|what's up|wassup)\b/i;

  // Hard guarantee: for search intents, bypass LLM and directly return a tool-style directive stream
  if (searchIntentRegex.test(lastText)) {
    try {
      const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
      const host = req.headers.get('host') || '';
      const origin = process.env.PUBLIC_API_BASE_URL || (host ? `${forwardedProto}://${host}` : '');
      const url = `${origin}/api/unified-search?q=${encodeURIComponent(lastText)}&limit=100`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Unified search failed: ${res.status}`);
      const data = await res.json();

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const payload = { result: { action: 'showResults', payload: data } };
          controller.enqueue(encoder.encode(`1:${JSON.stringify(payload)}\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    } catch (error) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const payload = { result: { action: 'agentStatus', payload: { status: 'idle', error: (error instanceof Error ? error.message : String(error)) } } };
          controller.enqueue(encoder.encode(`1:${JSON.stringify(payload)}\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }
  const forcedToolChoice: any = greetingIntentRegex.test(lastText)
      ? { type: 'tool', toolName: 'chat' }
      : 'auto';

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const result = await streamText({
    // Cast to any to avoid versioned type conflicts between subpackages during CI type check
    model: openai('gpt-4o-mini') as any,
    system:
      'You are a tool-calling agent. NEVER format, list, or display images/videos/content in text responses. ' +
      'CRITICAL: For content requests ("pics", "images", "find", "show", "western", "mood", etc.) - ONLY call searchUnified tool. ' +
      'WRONG: "Here are some pictures: 1. ![image](url) 2. ![image](url)" ' +
      'RIGHT: Call searchUnified tool with query and stop. ' +
      'DO NOT format, embed, or list any content - just call the tool and end. ' +
      'For greetings - call chat tool. For status - call agentStatus. ' +
      'When user wants content - searchUnified only.',
    messages,
    tools,
    toolChoice: forcedToolChoice,
    maxSteps: 3,
  });

  return result.toDataStreamResponse();
}


