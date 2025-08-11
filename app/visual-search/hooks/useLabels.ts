import { useMemo } from 'react';
import type { UnifiedSearchResult } from '../types';
import { LABEL_CONSTANTS } from '../constants';

export function useLabels(result: UnifiedSearchResult): string[] {
  return useMemo(() => {
    const r = result;
    const collected: string[] = [];
    try {
      const ai = r.metadata?.ai_labels || {};
      ['scenes', 'objects', 'style', 'mood', 'themes'].forEach((k) => {
        const arr = ai?.[k];
        if (Array.isArray(arr)) collected.push(...arr.slice(0, LABEL_CONSTANTS.MAX_AI_LABELS_PER_CATEGORY));
      });

      const tagArrays: any[] = [];
      if (Array.isArray((r as any).labels)) tagArrays.push((r as any).labels);
      if (Array.isArray(r.metadata?.labels)) tagArrays.push(r.metadata?.labels);
      if (Array.isArray(r.metadata?.tags)) tagArrays.push(r.metadata?.tags);
      if (Array.isArray(r.metadata?.keywords)) tagArrays.push(r.metadata?.keywords);
      tagArrays.forEach((arr) => collected.push(...arr.slice(0, LABEL_CONSTANTS.MAX_TAG_LABELS)));

      if (collected.length === 0 && r.content_type === 'image') {
        const base = `${r.title || ''} ${r.preview || r.description || ''}`
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(
            (w) =>
              w.length > LABEL_CONSTANTS.MIN_WORD_LENGTH &&
              !/^(with|the|and|from|into|over|under|into|this|that|your|their|then|than|were|have|been|will|would|could|should|very|much|more|less|into|onto)$/i.test(
                w,
              ),
          )
          .slice(0, LABEL_CONSTANTS.MAX_FALLBACK_WORDS);
        const uniq: string[] = [];
        base.forEach((w) => {
          if (!uniq.includes(w)) uniq.push(w);
        });
        collected.push(...uniq.slice(0, LABEL_CONSTANTS.MAX_FALLBACK_LABELS));
      }
    } catch {}
    return collected.slice(0, LABEL_CONSTANTS.MAX_TOTAL_LABELS);
  }, [result]);
}



