type Json = string | number | boolean | null | undefined | Json[] | { [key: string]: Json };

function now() { return Date.now(); }

export type CacheEntry<T = Json> = { value: T; expiresAt?: number };

export const cacheStore = {
  get<T = Json>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      if (parsed?.expiresAt && parsed.expiresAt < now()) {
        sessionStorage.removeItem(key);
        return null;
      }
      return parsed?.value ?? null;
    } catch {
      return null;
    }
  },
  set<T = Json>(key: string, value: T, ttlMs?: number) {
    if (typeof window === 'undefined') return;
    try {
      const entry: CacheEntry<T> = { value, expiresAt: ttlMs ? now() + ttlMs : undefined };
      sessionStorage.setItem(key, JSON.stringify(entry));
    } catch {}
  },
  delete(key: string) {
    if (typeof window === 'undefined') return;
    try { sessionStorage.removeItem(key); } catch {}
  }
};



