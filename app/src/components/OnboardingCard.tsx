/**
 * 첫 진입 환영 카드 (Home 상단).
 *
 * 목적:
 *  - 음성 재생 방식을 선택 받는다 — 기기 음성(device) vs 녹음 음성(recorded).
 *  - 녹음 음성을 선택하면 mp3 일괄 다운로드를 권유한다 — 오프라인 안정성↑.
 *
 * 라벨링:
 *  - "일반 사용자/어르신용" 같은 사용자 분류 대신 기능 자체로 표기한다.
 *    어떤 분이든 어색함 없이 선택할 수 있고, 정책(어떤 경로로 재생할지)도
 *    이 모드 하나로 결정된다.
 *
 * 표시 조건:
 *  - userMode === null (아직 미선택)
 *  - 인앱 브라우저가 아닐 때 (Home 페이지에서 inApp 배너와 동시 표출 회피)
 */
import { useEffect, useRef, useState } from 'react';
import { Smartphone, FileAudio, Download, X, Loader2, CheckCircle2 } from 'lucide-react';
import { useSettings } from '@/stores/settings';
import { bulkDownloadAll, getManifestSize } from '@/lib/ttsBulkDownload';
import { cn } from '@/lib/cn';

type Step = 'mode' | 'recorded-download';

export default function OnboardingCard(): JSX.Element | null {
  const userMode = useSettings((s) => s.userMode);
  const hydrated = useSettings((s) => s.hydrated);
  const setUserMode = useSettings((s) => s.setUserMode);
  const setTTSBulkStatus = useSettings((s) => s.setTTSBulkStatus);
  const setTTSBulkProgress = useSettings((s) => s.setTTSBulkProgress);

  const [step, setStep] = useState<Step>('mode');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number; total: number }>({
    done: 0,
    failed: 0,
    total: getManifestSize(),
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!hydrated) return null;
  if (userMode !== null) return null;

  const pickDevice = (): void => {
    setUserMode('device');
  };

  // 녹음 음성 선택 직후에는 userMode를 아직 기록하지 않는다.
  // 기록하면 컴포넌트가 unmount되어 다운로드 화면이 사라지기 때문.
  // 실제 기록은 다운로드 종료/닫기 시점에 한 번 수행.
  const pickRecorded = (): void => {
    setStep('recorded-download');
  };

  const startDownload = async (): Promise<void> => {
    if (running) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setTTSBulkStatus('downloading');
    setTTSBulkProgress({ done: 0, total: getManifestSize() });
    const result = await bulkDownloadAll({
      signal: ac.signal,
      onProgress: (p) => {
        setProgress(p);
        setTTSBulkProgress({ done: p.done, total: p.total });
      },
    });
    setRunning(false);
    setTTSBulkProgress({ done: result.done, total: result.total });
    if (result.aborted) {
      setTTSBulkStatus('skipped');
      // 중지는 사용자가 명시적으로 누른 흐름 — 모드 기록하고 카드 닫음.
      setUserMode('recorded');
    } else if (result.failed === 0) {
      setTTSBulkStatus('done');
      // 완료 화면을 잠시 보여준 뒤 [완료] 버튼 클릭 시 unmount.
    } else {
      setTTSBulkStatus('partial');
    }
  };

  // "나중에"/"X" — userMode는 recorded로 기록(선호 모드는 정해졌음)하고
  // 다운로드 상태는 skipped. Settings에서 언제든 재시도 가능.
  const skipDownload = (): void => {
    abortRef.current?.abort();
    setTTSBulkStatus('skipped');
    setUserMode('recorded');
  };

  // "완료" 또는 다운로드 종료 후 카드 닫기.
  const closeCard = (): void => {
    setUserMode('recorded');
  };

  if (step === 'mode') {
    return (
      <section className="rounded-2xl border-2 border-primary/30 bg-primary-soft p-4 sm:p-5">
        <p className="text-base font-bold text-fg">
          음성 재생 방식을 골라 주세요
        </p>
        <p className="text-sm text-fg/80 mt-1">
          나중에 설정에서 바꿀 수 있어요.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={pickDevice}
            className="rounded-xl border border-divider bg-surface p-4 text-left active:scale-[0.98] transition-transform"
          >
            <span className="inline-flex w-9 h-9 items-center justify-center rounded-lg bg-primary-soft text-primary mb-2">
              <Smartphone size={20} aria-hidden />
            </span>
            <p className="font-bold text-fg">기기 음성으로 듣기</p>
            <p className="text-xs text-muted mt-1">
              단말기에 설치된 중국어 음성팩을 사용해요. <b>추가 다운로드가 없어</b>
              앱 용량이 가볍고, 한 번 열어 두면 <b>오프라인에서도</b> 들립니다.
              음성팩이 없는 기기에서는 들리지 않을 수 있어요(도움말 참고).
            </p>
          </button>
          <button
            type="button"
            onClick={pickRecorded}
            className="rounded-xl border-2 border-primary bg-surface p-4 text-left active:scale-[0.98] transition-transform"
          >
            <span className="inline-flex w-9 h-9 items-center justify-center rounded-lg bg-primary text-white mb-2">
              <FileAudio size={20} aria-hidden />
            </span>
            <p className="font-bold text-fg">녹음 음성으로 듣기</p>
            <p className="text-xs text-muted mt-1">
              미리 녹음된 음성으로 재생해요. <b>약 20~40MB</b>를 한 번 받으면
              <b> 오프라인에서도</b> 같은 발음으로 일관되게 들립니다.
            </p>
          </button>
        </div>
      </section>
    );
  }

  // recorded-download
  const total = progress.total || getManifestSize();
  const pct = total ? Math.floor((progress.done / total) * 100) : 0;
  const isDone = !running && progress.done > 0 && progress.done + progress.failed >= total;

  return (
    <section className="rounded-2xl border-2 border-primary/30 bg-primary-soft p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-bold text-fg">중국어 음성 미리 받기</p>
        <button
          type="button"
          onClick={skipDownload}
          aria-label="카드 닫기"
          className="text-muted hover:text-fg"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <p className="text-sm text-fg/80 mt-1">
        약 <b>{total}</b>개 파일 (대략 20~40MB). <b>Wi-Fi 권장</b>.
        한 번 받아두면 인터넷 없이도 음성이 들립니다.
      </p>

      {(running || isDone) && (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={progress.done}
            className="w-full h-2 rounded-full bg-divider overflow-hidden"
          >
            <div
              className={cn(
                'h-full transition-[width] duration-300',
                isDone && progress.failed === 0 ? 'bg-success' : 'bg-primary',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted mt-1.5 inline-flex items-center gap-1.5">
            {running ? (
              <>
                <Loader2 size={14} aria-hidden className="animate-spin" />
                받는 중… {progress.done}/{total}
                {progress.failed > 0 && ` (실패 ${progress.failed})`}
              </>
            ) : (
              <>
                <CheckCircle2 size={14} aria-hidden className="text-success" />
                완료: {progress.done}/{total}
                {progress.failed > 0 && ` · 실패 ${progress.failed}개 (Wi-Fi 후 재시도 가능)`}
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!running && !isDone && (
          <>
            <button
              type="button"
              onClick={() => void startDownload()}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-4 py-2"
            >
              <Download size={16} aria-hidden />
              지금 받기
            </button>
            <button
              type="button"
              onClick={skipDownload}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface text-fg text-sm font-semibold px-4 py-2 border border-divider"
            >
              나중에
            </button>
          </>
        )}
        {running && (
          <button
            type="button"
            onClick={skipDownload}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface text-fg text-sm font-semibold px-4 py-2 border border-divider"
          >
            중지
          </button>
        )}
        {isDone && (
          <button
            type="button"
            onClick={closeCard}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-4 py-2"
          >
            완료
          </button>
        )}
      </div>
    </section>
  );
}
