import { create } from 'zustand';
import type { GenerateResponse } from '../types';
import * as generateService from '../services/generateService';

type Mode = 'image' | 'video' | 'audio' | 'text' | null;

type GenerateState = {
  mode: Mode;
  url: string | null;
  raw: GenerateResponse | null;
  loading: boolean;
  error: string | null;
  start: (mode: NonNullable<Mode>, model: string | undefined, prompt: string, refs: string[], options?: Record<string, any>) => Promise<void>;
  complete: (url: string | null, raw: GenerateResponse) => void;
  reset: () => void;
};

export const useGenerateStore = create<GenerateState>((set) => ({
  mode: null,
  url: null,
  raw: null,
  loading: false,
  error: null,
  start: async (mode, model, prompt, refs, options) => {
    set({ loading: true, error: null, mode, url: null, raw: null });
    try {
      const json = await generateService.runGenerate({ mode, model, prompt, refs, options });
      set({ url: json?.url ?? null, raw: json, loading: false });
    } catch (e: any) {
      set({ error: e?.message || 'Generation failed', loading: false });
    }
  },
  complete: (url, raw) => set({ url, raw, loading: false }),
  reset: () => set({ mode: null, url: null, raw: null, loading: false, error: null }),
}));



