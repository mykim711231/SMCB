import { create } from 'zustand';

export type UpdatePhase =
  | 'idle'
  | 'downloading'
  | 'installing'
  | 'error';
export type UpdateUI = { phase: UpdatePhase; pct: number };

type UpdateState = {
  ui: UpdateUI;
  retrySW: (() => void) | null;
  setPhase: (phase: UpdatePhase, pct?: number) => void;
  setRetryFn: (fn: () => void) => void;
  setError: () => void;
  dismiss: () => void;
};

export const useUpdateStore = create<UpdateState>((set) => ({
  ui: { phase: 'idle', pct: 0 },
  retrySW: null,
  setPhase: (phase, pct) =>
    set((s) => ({ ui: { phase, pct: pct ?? s.ui.pct } })),
  setRetryFn: (fn) => set({ retrySW: fn }),
  // precache 실패 — pct를 0으로 내려 진행 바를 숨기고 에러 UI로 전환.
  setError: () => set({ ui: { phase: 'error', pct: 0 } }),
  dismiss: () => set({ ui: { phase: 'idle', pct: 0 } }),
}));
