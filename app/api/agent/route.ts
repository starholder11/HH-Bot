import { NextRequest } from 'next/server';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';

// Tools
const tools = {
  // Prepare the Generate tab with structured params; client will populate the form and optionally auto-run
  prepareGenerate: tool({
    description: 'Populate the Generate tab with parameters and optionally start generation',
    parameters: z.object({
      type: z.enum(['image', 'audio', 'text', 'video']).optional(),
      model: z.string().optional(),
      prompt: z.string().optional(),
      references: z.array(z.string()).optional(),
      options: z.record(z.any()).optional(),
      autoRun: z.boolean().optional(),
    }),
    execute: async ({ type, model, prompt, references, options, autoRun }) => {
      return { action: 'prepareGenerate', payload: { type, model, prompt, refs: references, options, autoRun: autoRun ?? true } };
    }
  }),
  searchUnified: tool({
    description: 'Search across media and text content',
    parameters: z.object({
      query: z.string(),
      contentType: z.enum(['all', 'media', 'video', 'image', 'audio', 'text']).default('all'),
      limit: z.number().int().min(1).max(5000).default(1000),
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
  agentStatus: tool({
    description: 'Get the in-app agent generation status (what is running, last run URL)',
    parameters: z.object({}),
    execute: async () => {
      const res = await fetch(`${process.env.PUBLIC_API_BASE_URL || ''}/api/agent/status` || '/api/agent/status', { method: 'GET' });
      if (!res.ok) throw new Error('Status fetch failed');
      return await res.json();
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
        // Also tell the client to show the Generate tab populated
        return { action: 'prepareGenerate', payload: { type, model, prompt, refs: [], options: options || {}, autoRun: true } };
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
  useCanvasLora: tool({
    description: 'Select a canvas by id or name, pick its completed LoRA, and prepare image generation with that LoRA applied',
    parameters: z.object({
      canvas: z.string().describe('Canvas id or name'),
      prompt: z.string().describe('Prompt to generate'),
      scale: z.number().min(0.1).max(2).optional().default(1.0),
    }),
    execute: async ({ canvas, prompt, scale }) => {
      // Fetch canvas list to resolve id → load canvas details
      const base = process.env.PUBLIC_API_BASE_URL || ''
      const listRes = await fetch(`${base}/api/canvas` || '/api/canvas', { method: 'GET' })
      if (!listRes.ok) throw new Error('Failed to list canvases')
      const list = await listRes.json()
      const items: any[] = list.items || []
      const match = items.find((it) => it.id === canvas) || items.find((it) => (it.name || '').toLowerCase() === canvas.toLowerCase())
      if (!match?.id) {
        // Populate the UI to let user pick
        return { action: 'showMessage', payload: { level: 'warn', text: `Canvas '${canvas}' not found.` } }
      }
      const detailRes = await fetch(`${base}/api/canvas?id=${encodeURIComponent(match.id)}` || `/api/canvas?id=${encodeURIComponent(match.id)}`, { method: 'GET' })
      if (!detailRes.ok) throw new Error('Failed to load canvas')
      const detail = await detailRes.json()
      const c = detail.canvas || {}
      const loras: any[] = Array.isArray(c.loras) ? c.loras : []
      const completed = loras.filter((l) => l.status === 'completed' && (l.artifactUrl || l.path))
      if (completed.length === 0) {
        return { action: 'showMessage', payload: { level: 'warn', text: `Canvas '${c.name || c.id}' has no completed LoRA.` } }
      }
      const chosen = completed[completed.length - 1]
      // Prepare Generate with FLUX LoRA model and loras param
      return {
        action: 'prepareGenerate',
        payload: {
          type: 'image',
          model: 'fal-ai/flux-lora',
          prompt,
          refs: [],
          options: { loras: [{ path: chosen.artifactUrl || chosen.path, scale: scale ?? 1.0 }] },
          autoRun: true,
        }
      }
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


