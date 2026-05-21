import { create } from 'zustand';

export type UpdatePhase = 'idle' | 'downloading' | 'installing' | 'ready' | 'updating';
export type UpdateUI = { phase: UpdatePhase; pct: number };

type UpdateState = {
  ui: UpdateUI;
  updateSWA: (() => void) | null;
  setPhase: (phase: UpdatePhase, pct?: number) => void;
  setUpdateFn: (fn: () => void) => void;
  dismiss: () => void;
};

export const useUpdateStore = create<UpdateState>((set) => ({
  ui: { phase: 'idle', pct: 0 },
  updateSWA: null,
  setPhase: (phase, pct) =>
    set((s) => ({ ui: { phase, pct: pct ?? s.ui.pct } })),
  setUpdateFn: (fn) => set({ updateSWA: fn, ui: { phase: 'ready', pct: 100 } }),
  dismiss: () => set({ ui: { phase: 'idle', pct: 0 } }),
}));
