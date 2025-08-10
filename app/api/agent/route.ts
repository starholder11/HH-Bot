import { NextRequest } from 'next/server';
import { streamText, tool, generateObject } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';

// Ultra-simplified Zod schemas to avoid all OpenAI function schema validation issues
const PrepareGenerateParameters = z.object({
  type: z.enum(['image', 'audio', 'text', 'video']).optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  references: z.array(z.string()).optional(),
  options: z.any().optional(), // Use z.any() to avoid all nested validation
  autoRun: z.boolean().optional(),
});

const GenerateMediaParameters = z.object({
  prompt: z.string(),
  type: z.enum(['image', 'audio', 'text', 'video']),
  model: z.string().optional(),
  references: z.array(z.string()).optional(),
  options: z.any().optional(), // Use z.any() to avoid all nested validation
});

// Tools
const tools = {
  // Prepare the Generate tab with structured params; client will populate the form and optionally auto-run
  prepareGenerate: tool({
    description: 'Populate the Generate tab with parameters and optionally start generation',
    parameters: PrepareGenerateParameters,
    execute: async ({ type, model, prompt, references, options, autoRun }) => {
      return { action: 'prepareGenerate', payload: { type, model, prompt, refs: references, options, autoRun: autoRun ?? true } };
    }
  }),
  planAndSearch: tool({
    description: 'Turn a messy user ask into a structured multi-query search plan and execute it to show results',
    parameters: z.object({
      ask: z.string().describe('User natural language request'),
      limit: z.number().int().min(1).max(2000).default(200),
    }),
    execute: async ({ ask, limit }) => {
      // 1) Plan with a tiny planner model (strict JSON)
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
      const plannerModelId = process.env.AGENT_PLANNER_MODEL || 'gpt-5-nano';
      const PlanSchema = z.object({
        queries: z.array(z.string()).min(1).max(8),
        filters: z.object({
          types: z.array(z.enum(['all','media','video','image','audio','text'])).default(['all']),
          mustInclude: z.array(z.string()).default([]),
          mustExclude: z.array(z.string()).default([]),
          timeRange: z.object({ from: z.string().optional(), to: z.string().optional() }).optional(),
          tags: z.array(z.string()).optional(),
        }).default({}),
        expandSynonyms: z.boolean().default(true),
        numResults: z.number().int().min(10).max(1000).default(Math.min(200, limit || 200)),
      });

      let plan: z.infer<typeof PlanSchema>;
      try {
        const planRes = await generateObject({
          model: openai(plannerModelId) as any,
          schema: PlanSchema,
          system: 'You convert a short, messy user ask into a SearchPlan JSON. No prose. Keep queries concise. Prefer 2-6 queries. Use broad synonyms when expandSynonyms is true. Never include private data.',
          prompt: `User ask: ${ask}`,
        });
        plan = planRes.object as any;
      } catch (e) {
        // Fallback: heuristic plan if model not available
        const words = (ask || '').toLowerCase().split(/\s+/).filter(Boolean);
        const baseQ = words.slice(0, 6).join(' ');
        plan = {
          queries: [baseQ, `${baseQ} high quality`, `${baseQ} cinematic`].filter((v, i, a) => v && a.indexOf(v) === i),
          filters: { types: ['media'], mustInclude: [], mustExclude: [] },
          expandSynonyms: true,
          numResults: Math.min(200, limit || 200),
        } as any;
      }

      // 2) Expand synonyms (domain-specific) if requested
      const synonyms: Record<string, string[]> = {
        creepy: ['eerie','uncanny','liminal','haunting','spooky','gothic','nocturne'],
        cool: ['stylish','sleek','retro','vintage','aesthetic','polished'],
        futuristic: ['sci-fi','cyberpunk','neo','space age'],
        old: ['vintage','antique','retro','classic'],
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

      const queries = Array.from(new Set(plan.queries.flatMap(expandTerms))).slice(0, 12);
      const types = (plan.filters?.types && plan.filters.types.length ? plan.filters.types : ['all']) as any;

      // 3) Execute in parallel against unified search
      const base = process.env.PUBLIC_API_BASE_URL || '';
      const fetchOne = async (q: string) => {
        const typeParam = types.includes('all') ? '' : `&type=${encodeURIComponent(types[0])}`;
        const url = `${base}/api/unified-search?q=${encodeURIComponent(q)}&limit=${Math.min(plan.numResults, limit)}${typeParam}` || `/api/unified-search?q=${encodeURIComponent(q)}&limit=${Math.min(plan.numResults, limit)}${typeParam}`;
        try {
          const r = await fetch(url, { method: 'GET' });
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      };

      const pages = await Promise.all(queries.map(fetchOne));
      const results: any[] = [];
      const seen = new Set<string>();
      for (const page of pages) {
        const arr = page?.results?.all || page?.results || page?.all || [];
        for (const item of arr) {
          const id = String(item.id || item.metadata?.id || item.url || Math.random());
          if (seen.has(id)) continue;
          // simple filter pass
          const text = `${item.title || ''} ${item.description || ''} ${JSON.stringify(item.metadata||{})}`.toLowerCase();
          const mustInc = (plan.filters?.mustInclude || []).every(t => text.includes(t.toLowerCase()));
          const mustExc = (plan.filters?.mustExclude || []).some(t => text.includes(t.toLowerCase()));
          if (!mustInc || mustExc) continue;
          seen.add(id);
          results.push(item);
        }
      }

      // 4) Return to UI
      return { action: 'showResults', payload: { success: true, query: ask, total_results: results.length, results: { all: results, media: results, text: [] } } };
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
      // Return a directive for the client UI to show results in the UI
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
    parameters: GenerateMediaParameters,
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
      scale: z.number().min(0.1).max(2).default(1.0),
    }),
    execute: async ({ canvas, prompt, scale }) => {
      // Get all LoRAs from the global catalog first
      const base = process.env.PUBLIC_API_BASE_URL || ''
      const lorasRes = await fetch(`${base}/api/loras` || '/api/loras', { method: 'GET' })
      if (!lorasRes.ok) throw new Error('Failed to fetch LoRAs')
      const allLoras = await lorasRes.json()

      // Robust normalization: lowercase, NFKD, strip diacritics, unify quotes, remove non-alphanumerics
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // smart/single quotes to '
          .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // smart double quotes to "
          .replace(/[\u0300-\u036f]/g, '') // strip diacritics
          .replace(/[^a-z0-9]+/g, '') // keep only a-z0-9

      const inputNorm = normalize(canvas)

      // 1) Exact canvasId match
      let best = allLoras.find((l: any) => l.canvasId === canvas)

      // 2) Exact normalized name match
      if (!best) best = allLoras.find((l: any) => normalize(String(l.canvasName || '')) === inputNorm)

      // 3) Substring match either direction
      if (!best) best = allLoras.find((l: any) => {
        const n = normalize(String(l.canvasName || ''))
        return n.includes(inputNorm) || inputNorm.includes(n)
      })

      // 4) Levenshtein fallback
      if (!best) {
        const distance = (a: string, b: string) => {
          const m = a.length, n = b.length
          if (m === 0) return n
          if (n === 0) return m
          const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
          for (let i = 0; i <= m; i++) dp[i][0] = i
          for (let j = 0; j <= n; j++) dp[0][j] = j
          for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
              const cost = a[i - 1] === b[j - 1] ? 0 : 1
              dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
              )
            }
          }
          return dp[m][n]
        }
        let bestItem: any = null
        let bestScore = Infinity
        for (const l of allLoras) {
          const n = normalize(String(l.canvasName || ''))
          const d = distance(inputNorm, n)
          if (d < bestScore) { bestScore = d; bestItem = l }
        }
        const maxAllowed = Math.max(1, Math.floor(Math.max(inputNorm.length, 3) * 0.25))
        if (bestItem && bestScore <= maxAllowed) best = bestItem
      }

      if (!best) {
        return { action: 'showMessage', payload: { level: 'warn', text: `No completed LoRA found for canvas '${canvas}'.` } }
      }

      // Prepare generation with the matched LoRA
      return {
        action: 'prepareGenerate',
        payload: {
          type: 'image',
          model: 'fal-ai/flux-lora',
          prompt: prompt,
          options: {
            loras: [{ path: best.path, scale: typeof scale === 'number' ? scale : 1.0 }]
          },
          autoRun: true
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


