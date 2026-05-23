import { create } from 'zustand';

export type UpdatePhase =
  | 'idle'
  | 'downloading'
  | 'installing'
  | 'ready'
  | 'updating'
  | 'error';
export type UpdateUI = { phase: UpdatePhase; pct: number };

type UpdateState = {
  ui: UpdateUI;
  updateSWA: (() => void) | null;
  retrySW: (() => void) | null;
  // 'updating' 토스트에서 사용자가 직접 즉시 reload 하기 위한 escape hatch.
  // controllerchange 미발생 + 하드 타임아웃 미발화 환경 안전망.
  forceReload: (() => void) | null;
  setPhase: (phase: UpdatePhase, pct?: number) => void;
  setUpdateFn: (fn: () => void) => void;
  setRetryFn: (fn: () => void) => void;
  setForceReloadFn: (fn: () => void) => void;
  setError: () => void;
  dismiss: () => void;
};

export const useUpdateStore = create<UpdateState>((set) => ({
  ui: { phase: 'idle', pct: 0 },
  updateSWA: null,
  retrySW: null,
  forceReload: null,
  setPhase: (phase, pct) =>
    set((s) => ({ ui: { phase, pct: pct ?? s.ui.pct } })),
  setUpdateFn: (fn) => set({ updateSWA: fn, ui: { phase: 'ready', pct: 100 } }),
  setRetryFn: (fn) => set({ retrySW: fn }),
  setForceReloadFn: (fn) => set({ forceReload: fn }),
  // precache 실패 — pct를 0으로 내려 진행 바를 숨기고 에러 UI로 전환한다.
  setError: () => set({ ui: { phase: 'error', pct: 0 } }),
  dismiss: () => set({ ui: { phase: 'idle', pct: 0 } }),
}));
