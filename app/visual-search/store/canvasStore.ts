import { create } from 'zustand';
import type { PinnedItem, UnifiedSearchResult, CanvasData, LoraModel, Project } from '../types';
import { CANVAS_DEFAULTS } from '../constants';

type CanvasState = {
  pinned: PinnedItem[];
  zCounter: number;
  canvasId: string | null;
  canvasName: string;
  canvasNote: string;
  canvasProjectId: string;
  canvases: CanvasData[];
  loraTraining: null | { status: string; requestId?: string };
  canvasLoras: LoraModel[];
  allLoras: LoraModel[];
  projects: Project[];
  setPinned: (updater: (prev: PinnedItem[]) => PinnedItem[]) => void;
  addPin: (r: UnifiedSearchResult, baseX: number, baseY: number) => void;
  movePin: (id: string, x: number, y: number) => void;
  removePin: (id: string) => void;
  reorderPinned: (fromIndex: number, toIndex: number) => void;
  setCanvasName: (v: string) => void;
  setCanvasNote: (v: string) => void;
  setCanvasProjectId: (v: string) => void;
  setCanvasId: (v: string | null) => void;
  setCanvases: (v: CanvasData[]) => void;
  setCanvasLoras: (v: LoraModel[]) => void;
  setAllLoras: (updater: (prev: LoraModel[]) => LoraModel[]) => void;
  setProjects: (v: Project[]) => void;
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  pinned: [],
  zCounter: CANVAS_DEFAULTS.Z_COUNTER_START,
  canvasId: null,
  canvasName: '',
  canvasNote: '',
  canvasProjectId: '',
  canvases: [],
  loraTraining: null,
  canvasLoras: [],
  allLoras: [],
  projects: [],
  setPinned: (updater) => set((s) => ({ pinned: updater(s.pinned) })),
  addPin: (r, baseX, baseY) => set((s) => ({
    pinned: [
      ...s.pinned,
      {
        id: `${r.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        result: r,
        x: baseX,
        y: baseY,
        z: s.zCounter + 1,
        width: CANVAS_DEFAULTS.PIN_WIDTH,
        height: CANVAS_DEFAULTS.PIN_HEIGHT,
      },
    ],
    zCounter: s.zCounter + 1,
  })),
  movePin: (id, x, y) => set((s) => ({
    pinned: s.pinned.map((p) => (p.id === id ? { ...p, x, y, z: s.zCounter + 1 } : p)),
    zCounter: s.zCounter + 1,
  })),
  removePin: (id) => set((s) => ({ pinned: s.pinned.filter((p) => p.id !== id) })),
  reorderPinned: (fromIndex, toIndex) => set((s) => {
    const arr = [...s.pinned];
    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, moved);
    return { pinned: arr };
  }),
  setCanvasName: (v) => set({ canvasName: v }),
  setCanvasNote: (v) => set({ canvasNote: v }),
  setCanvasProjectId: (v) => set({ canvasProjectId: v }),
  setCanvasId: (v) => set({ canvasId: v }),
  setCanvases: (v) => set({ canvases: v }),
  setCanvasLoras: (v) => set({ canvasLoras: v }),
  setAllLoras: (updater) => set((s) => ({ allLoras: updater(s.allLoras) })),
  setProjects: (v) => set({ projects: v }),
}));



