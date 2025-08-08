import { NextRequest } from 'next/server';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';

// Tools
const tools = {
  searchUnified: tool({
    description: 'Search across media and text content',
    parameters: z.object({
      query: z.string(),
      contentType: z.enum(['all', 'media', 'video', 'image', 'audio', 'text']).default('all'),
      limit: z.number().int().min(1).max(100).default(18),
    }),
    execute: async ({ query, contentType, limit }) => {
      const typeParam = contentType && contentType !== 'all' ? `&type=${encodeURIComponent(contentType)}` : '';
      const url = `${process.env.PUBLIC_API_BASE_URL || ''}/api/unified-search?q=${encodeURIComponent(query)}&limit=${limit}${typeParam}`;
      const res = await fetch(url || `/api/unified-search?q=${encodeURIComponent(query)}&limit=${limit}${typeParam}`, { method: 'GET' });
      if (!res.ok) throw new Error(`Unified search failed: ${res.status}`);
      const json = await res.json();
      // Return a directive for the client to show results in the UI
      return { action: 'showResults', payload: json };
    }
  }),
  generateMedia: tool({
    description: 'Generate media using FAL.ai',
    parameters: z.object({
      prompt: z.string(),
      type: z.enum(['image', 'audio', 'text', 'video']),
      model: z.string().optional(),
      references: z.array(z.string()).optional(),
      options: z.record(z.any()).optional(),
    }),
    execute: async ({ prompt, type, model, references, options }) => {
      // If no references were provided, ask the client to supply pinned refs
      if (!references || references.length === 0) {
        return {
          action: 'requestPinnedThenGenerate',
          payload: { prompt, type, model, options: options || {} },
        };
      }

      const res = await fetch(`/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: type, model, prompt, refs: references || [], options: options || {} }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Generate failed');
      // Tell client to render in Output pane
      return { action: 'showOutput', payload: { type, response: json } };
    }
  }),
  pinToCanvas: tool({
    description: 'Pin an item to the visual canvas by metadata',
    parameters: z.object({
      id: z.string(),
      title: z.string().optional(),
      url: z.string().url().optional(),
    }),
    // Note: This returns a directive for the client UI to handle, since server cannot mutate client state
    execute: async ({ id, title, url }) => {
      return { action: 'pinToCanvas', id, title, url };
    }
  }),
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const result = await streamText({
    // Cast to any to avoid versioned type conflicts between subpackages during CI type check
    model: openai('gpt-4o-mini') as any,
    messages,
    tools,
    maxSteps: 6,
  });

  return result.toDataStreamResponse();
}


