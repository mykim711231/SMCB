import { RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { useUpdateStore } from '@/stores/useUpdateStore';
import type { UpdatePhase } from '@/stores/useUpdateStore';

function ProgressBar({ pct }: { pct: number }): JSX.Element {
  return (
    <div className="w-full h-1.5 rounded-full bg-divider/40 overflow-hidden">
      <div
        className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

const PHASE_UI: Record<UpdatePhase, { label: string; icon: JSX.Element | null }> = {
  idle: { label: '', icon: null },
  downloading: { label: '다운로드 중…', icon: <Loader2 size={14} className="animate-spin text-primary" aria-hidden /> },
  installing: { label: '설치 중…', icon: <Loader2 size={14} className="animate-spin text-primary" aria-hidden /> },
  ready: { label: '새 버전이 있습니다', icon: null },
  updating: { label: '업데이트 적용 중…', icon: <Loader2 size={14} className="animate-spin text-primary" aria-hidden /> },
};

export default function UpdateToast(): JSX.Element | null {
  const ui = useUpdateStore((s) => s.ui);
  const updateSWA = useUpdateStore((s) => s.updateSWA);

  if (ui.phase === 'idle') return null;

  const info = PHASE_UI[ui.phase];
  const isInProgress = ui.phase === 'downloading' || ui.phase === 'installing';
  const isReady = ui.phase === 'ready';

  return (
    <div
      className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className={`
          pointer-events-auto rounded-2xl bg-surface border border-primary shadow-lg
          px-4 py-3 max-w-sm min-w-[200px]
          ${isReady ? 'space-y-3' : 'space-y-2'}
        `}
      >
        {/* 헤더 행: 아이콘 + 레이블 + % */}
        <div className="flex items-center gap-2">
          {info.icon}
          <span className="text-sm text-fg font-medium flex-1">{info.label}</span>
          {isInProgress && (
            <span className="text-xs text-muted tabular-nums font-semibold">{ui.pct}%</span>
          )}
          {ui.phase === 'updating' && (
            <CheckCircle2 size={14} className="text-success" aria-hidden />
          )}
        </div>

        {/* 진행 바 (downloading / installing / updating 단계) */}
        {ui.pct > 0 && ui.pct < 100 && (
          <ProgressBar pct={ui.pct} />
        )}

        {/* ready: 업데이트 버튼 */}
        {isReady && (
          <button
            type="button"
            onClick={() => updateSWA?.()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-xs font-bold px-4 py-1.5 w-full justify-center"
          >
            <RefreshCw size={12} aria-hidden />
            지금 업데이트
          </button>
        )}
      </div>
    </div>
  );
}
