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
      const url = `${process.env.PUBLIC_API_BASE_URL || ''}/api/unified-search?q=${encodeURIComponent(query)}&limit=50`;
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

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const result = await streamText({
    // Cast to any to avoid versioned type conflicts between subpackages during CI type check
    model: openai('gpt-4o-mini') as any,
    system:
      'You are a UI controller agent. ALWAYS use tools to perform actions - never give text responses with embedded content. ' +
      'For ANY request involving content (images, videos, audio, search, media, "show me", "find", "pull up"), ' +
      'immediately call searchUnified tool. ' +
      'For status requests, call agentStatus. ' +
      'NEVER format or display content in text - always use the appropriate tool to populate the UI sections. ' +
      'If user says "show me", "find", "search", "pull up", "gimme" - call searchUnified immediately.',
    messages,
    tools,
    toolChoice: 'auto',
    maxSteps: 3,
  });

  return result.toDataStreamResponse();
}


