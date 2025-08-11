import { NextRequest } from 'next/server';
import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// Tools - Starting with simple ones first
const tools = {
  agentStatus: tool({
    description: 'Get the in-app agent generation status (what is running, last run URL)',
    parameters: z.object({}),
    execute: async () => {
      const res = await fetch(`${process.env.PUBLIC_API_BASE_URL || ''}/api/agent/status` || '/api/agent/status', { method: 'GET' });
      if (!res.ok) throw new Error('Status fetch failed');
      return await res.json();
    }
  }),
  searchUnified: tool({
    description: 'Search across media and text content',
    parameters: z.object({
      query: z.string(),
    }),
    execute: async ({ query }) => {
      const url = `${process.env.PUBLIC_API_BASE_URL || ''}/api/unified-search?q=${encodeURIComponent(query)}&limit=100`;
      const res = await fetch(url || `/api/unified-search?q=${encodeURIComponent(query)}&limit=100`, { method: 'GET' });
      if (!res.ok) throw new Error(`Unified search failed: ${res.status}`);
      const json = await res.json();
      return { action: 'showResults', payload: json };
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
    model: openai('gpt-5-nano') as any,
    system:
      'You are the on-page agent for a creative workspace. ALWAYS prefer calling tools over free-form answers. ' +
      'For anything involving finding media or text, call searchUnified and return its directive unchanged. ' +
      'For requests to create/generate media, either call generateMedia (with references if provided) or ' +
      'return prepareGenerate with parsed {type, model, prompt, options, references} so the UI can populate and run. ' +
      'Avoid listing raw URLs in chat; instead trigger UI actions via tool results.',
    messages,
    tools,
    maxSteps: 6,
  });

  return result.toDataStreamResponse();
}


