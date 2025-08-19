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
  systemPrompt: 'You are an AI workflow planner. Generate complete workflow_steps for compound actions.',
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


