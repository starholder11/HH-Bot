import { create } from 'zustand';

type RightTab = 'results' | 'canvas' | 'output' | 'generate';

type UiState = {
  rightTab: RightTab;
  selectedCardId: string | null;
  multiSelect: boolean;
  selectedIds: Set<string>;
  setRightTab: (t: RightTab) => void;
  setSelectedCard: (id: string | null) => void;
  toggleMultiSelect: (enabled: boolean) => void;
  setSelectedIds: (ids: Set<string> | string[]) => void;
  addSelectedId: (id: string) => void;
  removeSelectedId: (id: string) => void;
  toggleSelectedId: (id: string) => void;
  clearSelection: () => void;
};

export const useUiStore = create<UiState>((set, get) => ({
  rightTab: 'results',
  selectedCardId: null,
  multiSelect: false,
  selectedIds: new Set<string>(),
  setRightTab: (t) => set({ rightTab: t }),
  setSelectedCard: (id) => set({ selectedCardId: id }),
  toggleMultiSelect: (enabled) => set({ multiSelect: enabled }),
  setSelectedIds: (ids) => set({ selectedIds: Array.isArray(ids) ? new Set(ids) : new Set(ids) }),
  addSelectedId: (id) => set((state) => {
    const newSet = new Set(state.selectedIds);
    newSet.add(id);
    return { selectedIds: newSet };
  }),
  removeSelectedId: (id) => set((state) => {
    const newSet = new Set(state.selectedIds);
    newSet.delete(id);
    return { selectedIds: newSet };
  }),
  toggleSelectedId: (id) => set((state) => {
    const newSet = new Set(state.selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    return { selectedIds: newSet };
  }),
  clearSelection: () => set({ selectedCardId: null, selectedIds: new Set<string>() }),
}));



