import type { UnifiedSearchResult } from '../types';

export function getResultMediaUrl(result: UnifiedSearchResult): string | undefined {
  try {
    return (
      (result.metadata?.cloudflare_url as string | undefined) ||
      (result.metadata?.s3_url as string | undefined) ||
      (result.url as string | undefined) ||
      (result.s3_url as string | undefined) ||
      (result.cloudflare_url as string | undefined)
    );
  } catch {
    return undefined;
  }
}



