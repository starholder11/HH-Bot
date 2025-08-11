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
  planAndSearch: tool({
    description: 'Plan and execute a comprehensive search for creative content based on user request',
    parameters: z.object({
      ask: z.string(),
      limit: z.number()
    }),
    execute: async ({ ask, limit }) => {
      // Build a simple heuristic SearchPlan without model dependency
      const words = (ask || '').toLowerCase().split(/\s+/).filter(Boolean);
      const baseQ = words.slice(0, 6).join(' ');
      const effectiveLimit = limit || 200;
      const plan: any = {
        queries: [baseQ, `${baseQ} high quality`, `${baseQ} cinematic`].filter((v, i, a) => v && a.indexOf(v) === i),
        filters: { types: ['media'], mustInclude: [], mustExclude: [] },
        expandSynonyms: true,
        numResults: Math.min(200, effectiveLimit),
      };

      // Expand synonyms (domain-specific) if requested
      const synonyms: Record<string, string[]> = {
        creepy: ['eerie','uncanny','liminal','haunting','spooky','gothic','nocturne'],
        cool: ['stylish','sleek','retro','vintage','aesthetic','polished'],
        futuristic: ['sci-fi','cyberpunk','neo','space age'],
        old: ['vintage','antique','retro','classic'],
        western: ['cowboy','desert','frontier','saloon','dusty','ranch']
      };
      const expandTerms = (q: string) => {
        if (!plan.expandSynonyms) return [q];
        const parts = q.split(/\s+/);
        const expanded: string[] = [q];
        for (const p of parts) {
          const key = p.toLowerCase().replace(/[^a-z0-9]/g,'');
          if (synonyms[key]) {
            synonyms[key].forEach(s => expanded.push(q + ' ' + s));
          }
        }
        return Array.from(new Set(expanded)).slice(0, 6);
      };

      const queries: string[] = Array.from(new Set((plan.queries as string[]).flatMap(expandTerms))).slice(0, 12);
      const types = (plan.filters?.types && plan.filters.types.length ? plan.filters.types : ['all']) as any;

      // Execute in parallel against unified search
      const base = process.env.PUBLIC_API_BASE_URL || '';
      const fetchOne = async (q: string): Promise<any> => {
        const typeParam = types.includes('all') ? '' : `&type=${encodeURIComponent(types[0])}`;
        const url = `${base}/api/unified-search?q=${encodeURIComponent(q)}&limit=${Math.min(plan.numResults, effectiveLimit)}${typeParam}` || `/api/unified-search?q=${encodeURIComponent(q)}&limit=${Math.min(plan.numResults, effectiveLimit)}${typeParam}`;
        try {
          const r = await fetch(url, { method: 'GET' });
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      };

      const pages = await Promise.all((queries as string[]).map((q) => fetchOne(q)));
      const results: any[] = [];
      const seen = new Set<string>();
      for (const page of pages) {
        const arr = page?.results?.all || page?.results || page?.all || [];
        for (const item of arr) {
          const id = String(item.id || item.metadata?.id || item.url || Math.random());
          if (seen.has(id)) continue;
          seen.add(id);
          results.push(item);
        }
      }

      // Return to UI
      return { action: 'showResults', payload: { success: true, query: ask, total_results: results.length, results: { all: results, media: results, text: [] } } };
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
      'You are an AI agent that MUST use tools for every request. Never give text-only responses. ' +
      'For complex creative search requests (like "liminal western vibe photos"), use planAndSearch tool. ' +
      'For simple direct searches, use searchUnified tool. ' +
      'For media generation requests, call prepareGenerate or generateMedia tools. ' +
      'For status requests, call agentStatus tool. ' +
      'IMPORTANT: Always call a tool immediately - never explain what you will do, just execute the tool.',
    messages,
    tools,
    maxSteps: 6,
  });

  return result.toDataStreamResponse();
}


