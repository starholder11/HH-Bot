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
      const url = `${process.env.PUBLIC_API_BASE_URL || ''}/api/unified-search?q=${encodeURIComponent(query)}&limit=50`;
      const res = await fetch(url || `/api/unified-search?q=${encodeURIComponent(query)}&limit=100`, { method: 'GET' });
      if (!res.ok) throw new Error(`Unified search failed: ${res.status}`);
      const json = await res.json();
      return { action: 'showResults', payload: json };
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
      'You are an intelligent creative workspace assistant. Be conversational and helpful. ' +
      'When users ask for images, media, content, or want to "find/search/show/dig up" something, ' +
      'call searchUnified tool to populate the Results section. ' +
      'For general chat, questions, explanations, or discussions, respond normally with text. ' +
      'Be smart about when to search vs when to chat.',
    messages,
    tools,
    toolChoice: 'auto',
    maxSteps: 2,
  });

  return result.toDataStreamResponse();
}


