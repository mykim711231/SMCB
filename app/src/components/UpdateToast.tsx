import { RefreshCw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
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
  error: { label: '업데이트 실패', icon: <AlertTriangle size={14} className="text-accent" aria-hidden /> },
};

export default function UpdateToast(): JSX.Element | null {
  const ui = useUpdateStore((s) => s.ui);
  const updateSWA = useUpdateStore((s) => s.updateSWA);
  const retrySW = useUpdateStore((s) => s.retrySW);
  const forceReload = useUpdateStore((s) => s.forceReload);
  const dismiss = useUpdateStore((s) => s.dismiss);

  if (ui.phase === 'idle') return null;

  const info = PHASE_UI[ui.phase];
  const isInProgress = ui.phase === 'downloading' || ui.phase === 'installing';
  const isReady = ui.phase === 'ready';
  const isError = ui.phase === 'error';
  const isUpdating = ui.phase === 'updating';

  return (
    <div
      className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className={`
          pointer-events-auto rounded-2xl bg-surface shadow-lg border
          px-4 py-3 max-w-sm min-w-[200px]
          ${isError ? 'border-accent' : 'border-primary'}
          ${isReady || isError || isUpdating ? 'space-y-3' : 'space-y-2'}
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

        {/* updating: 일부 환경(iOS standalone PWA / Windows 등)에서 새 SW 활성화
           신호(controllerchange)가 안 와 무한 대기 사례 보고. 3초 하드
           타임아웃 안에 자동 reload 가 일어나지만, 그래도 막혀있으면
           사용자가 직접 탭하여 즉시 새로고침할 수 있게 한다. */}
        {isUpdating && (
          <button
            type="button"
            onClick={() => forceReload?.()}
            className="text-xs text-muted underline underline-offset-2 w-full text-center py-0.5"
          >
            오래 걸리면 탭하여 새로고침
          </button>
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

        {/* error: 안내 + 다시 시도 / 닫기 */}
        {isError && (
          <>
            <p className="text-xs text-muted leading-relaxed">
              네트워크 문제로 새 버전을 받지 못했어요. 잠시 후 다시 시도해 주세요.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => retrySW?.()}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-white text-xs font-bold px-4 py-1.5 flex-1"
              >
                <RefreshCw size={12} aria-hidden />
                다시 시도
              </button>
              <button
                type="button"
                onClick={() => dismiss()}
                className="rounded-full border border-divider text-muted text-xs font-bold px-4 py-1.5"
              >
                닫기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
