import { z } from 'zod';

type CachedConfig<T> = {
  value: T | null;
  etag: string | null;
  expiresAt: number; // epoch ms
};

export const PlannerConfigSchema = z.object({
  version: z.string().optional().default('local'),
  systemPrompt: z.string().min(10).describe('System prompt for planner'),
});
export type PlannerConfig = z.infer<typeof PlannerConfigSchema>;

export const UiMapConfigSchema = z.object({
  version: z.string().optional().default('local'),
  toolsToActions: z.record(z.string()).default({}),
});
export type UiMapConfig = z.infer<typeof UiMapConfigSchema>;

const defaultPlanner: PlannerConfig = {
  version: 'default',
  systemPrompt: `You are an AI workflow planner. Available tools: \${this.availableTools?.join(', ') || ''}.

CRITICAL: Look for compound actions that require MULTIPLE steps in sequence.

Key patterns to recognize:
- "find X and pin them" = SEARCH FIRST, then PIN
- "make X and save it" = GENERATE FIRST, then SAVE
- "search X and do Y" = SEARCH FIRST, then do Y

You MUST generate multiple workflow_steps for compound actions. The workflow_steps array should contain ALL steps needed.

MANDATORY EXAMPLES WITH EXACT PARAMETERS:

Input: "find four fish related things and pin them to canvas"
Output: workflow_steps: [
  { tool_name: "searchUnified", parameters: {query: "fish related things"} },
  { tool_name: "pinToCanvas", parameters: {count: 4} }
]

Input: "make me a picture of a cat and save it as fluffy"
Output: workflow_steps: [
  { tool_name: "prepareGenerate", parameters: {prompt: "cat", type: "image"} },
  { tool_name: "nameImage", parameters: {name: "fluffy"} },
  { tool_name: "saveImage", parameters: {} }
]

Input: "find a couple pictures of mountains and pin them"
Output: workflow_steps: [
  { tool_name: "searchUnified", parameters: {query: "pictures of mountains"} },
  { tool_name: "pinToCanvas", parameters: {count: 2} }
]

CRITICAL: Extract ALL relevant parameters from the user message:
- searchUnified needs "query" parameter with search terms - NEVER leave this empty
- pinToCanvas needs "count" parameter if number specified
- prepareGenerate needs "prompt" and "type" parameters
- nameImage needs "name" parameter

ADDITIONAL MANDATORY PATTERN (for robustness):
If the user says "make/create/generate ... and name it X" or "name ... X" then you MUST include nameImage with that exact name BEFORE saveImage.
Example inputs and outputs:
- Input: "make a picture of a cat and name it toby once it generates"
  Output: workflow_steps: [
    { tool_name: "prepareGenerate", parameters: { prompt: "picture of a cat", type: "image" } },
    { tool_name: "nameImage", parameters: { name: "toby" } },
    { tool_name: "saveImage", parameters: {} }
  ]

DO NOT generate empty parameters. Extract what the user requested. For searchUnified, ALWAYS extract the search terms from the user message.`,
};

const defaultUiMap: UiMapConfig = {
  version: 'default',
  toolsToActions: {
    searchUnified: 'searchUnified',
    prepareGenerate: 'prepareGenerate',
    generateContent: 'requestPinnedThenGenerate',
    pinToCanvas: 'pinToCanvas',
    pin: 'pinToCanvas',
    renameAsset: 'nameImage',
    nameImage: 'nameImage',
    saveImage: 'saveImage',
    chat: 'chat',
  },
};

const plannerCache: CachedConfig<PlannerConfig> = { value: null, etag: null, expiresAt: 0 };
const uiMapCache: CachedConfig<UiMapConfig> = { value: null, etag: null, expiresAt: 0 };

async function fetchJsonWithCache<T>(url: string, cache: CachedConfig<T>, ttlSec: number): Promise<{ value: T | null; version: string }> {
  const now = Date.now();
  if (cache.value && now < cache.expiresAt) {
    return { value: cache.value, version: (cache as any).value?.version || cache.etag || 'cached' };
  }
  const headers: Record<string, string> = {};
  if (cache.etag) headers['If-None-Match'] = cache.etag;
  const res = await fetch(url, { headers });
  if (res.status === 304 && cache.value) {
    cache.expiresAt = now + ttlSec * 1000;
    return { value: cache.value, version: (cache as any).value?.version || cache.etag || 'cached' };
  }
  if (!res.ok) {
    return { value: cache.value, version: (cache as any).value?.version || 'error' };
  }
  const etag = res.headers.get('etag');
  const json = await res.json();
  cache.value = json as T;
  cache.etag = etag;
  cache.expiresAt = now + ttlSec * 1000;
  const version = (json as any)?.version || etag || 'downloaded';
  return { value: cache.value, version };
}

export async function loadPlannerConfig(): Promise<{ config: PlannerConfig; version: string }>
{
  const url = process.env.PLANNER_RULES_URL;
  const ttl = parseInt(process.env.PLANNER_RULES_TTL_SEC || '60', 10);
  if (!url) return { config: defaultPlanner, version: defaultPlanner.version };
  try {
    const { value, version } = await fetchJsonWithCache<PlannerConfig>(url, plannerCache, ttl);
    if (!value) return { config: defaultPlanner, version: defaultPlanner.version };
    const parsed = PlannerConfigSchema.parse(value);
    return { config: parsed, version };
  } catch {
    return { config: defaultPlanner, version: defaultPlanner.version };
  }
}

export async function loadUiMapConfig(): Promise<{ config: UiMapConfig; version: string }>
{
  const url = process.env.UI_MAP_URL;
  const ttl = parseInt(process.env.UI_MAP_TTL_SEC || '60', 10);
  if (!url) return { config: defaultUiMap, version: defaultUiMap.version };
  try {
    const { value, version } = await fetchJsonWithCache<UiMapConfig>(url, uiMapCache, ttl);
    if (!value) return { config: defaultUiMap, version: defaultUiMap.version };
    const parsed = UiMapConfigSchema.parse(value);
    return { config: parsed, version };
  } catch {
    return { config: defaultUiMap, version: defaultUiMap.version };
  }
}

export function clearConfigCaches() {
  plannerCache.value = null; plannerCache.etag = null; plannerCache.expiresAt = 0;
  uiMapCache.value = null; uiMapCache.etag = null; uiMapCache.expiresAt = 0;
}


