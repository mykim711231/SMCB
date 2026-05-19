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

  // 외부에서 userMode가 'device'로 바뀌면 (Settings 패널, 다른 배너의 전환 버튼 등)
  // 현재 진행 중인 mp3 일괄 다운로드를 즉시 abort한다.
  //   - 카드는 곧 unmount되지만 bulkDownloadAll은 async 루프라 abort signal 없이는
  //     백그라운드에서 계속 진행돼 데이터/배터리를 낭비한다.
  //   - userMode === 'recorded' 일 때 의도적으로 시작된 다운로드는 그대로 유지.
  useEffect(() => {
    if (userMode === 'device' && running) {
      abortRef.current?.abort();
    }
  }, [userMode, running]);

  if (!hydrated) return null;
  // 모드 선택 단계만 userMode==null로 가드. 사용자가 'recorded'를 고르면
  // 즉시 mode persist + 다운로드 단계로 전환되므로, recorded-download 화면은
  // userMode==='recorded'여도 계속 렌더한다.
  if (step === 'mode' && userMode !== null) return null;

  const pickDevice = (): void => {
    setUserMode('device');
  };

  // 녹음 음성 선택 즉시 mode를 persist한다 (U3).
  // 이전엔 다운로드 종료/닫기 시점까지 기록을 미뤘는데,
  // 그 사이 앱이 강제 종료되면 첫 진입 시 OnboardingCard가 다시 떴다.
  // 렌더 가드(`step === 'mode' && userMode !== null`)로 카드가 사라지는 것을
  // 방지하므로 안전하게 즉시 기록 가능.
  const pickRecorded = (): void => {
    setUserMode('recorded');
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
      // userMode는 pickRecorded()에서 이미 'recorded'로 기록됨.
    } else if (result.failed === 0) {
      setTTSBulkStatus('done');
      // 완료 화면을 잠시 보여준 뒤 [완료] 버튼 클릭 시 unmount.
    } else {
      setTTSBulkStatus('partial');
    }
  };

  // "나중에"/"X" — 다운로드 상태는 skipped. userMode는 pickRecorded에서 기록됨.
  // Settings에서 언제든 재시도 가능.
  const skipDownload = (): void => {
    abortRef.current?.abort();
    setTTSBulkStatus('skipped');
    // 렌더 가드를 트리거하기 위해 step도 mode로 되돌리면 카드가 사라진다.
    // 단 userMode === 'recorded'이므로 카드는 이미 닫혀야 함 — step 변경으로 보장.
    setStep('mode');
  };

  // "완료" 또는 다운로드 종료 후 카드 닫기.
  // userMode는 pickRecorded에서 이미 'recorded'로 기록됨.
  // step을 'mode'로 되돌려 렌더 가드(`step === 'mode' && userMode !== null`)에
  // 의해 카드가 unmount되도록 한다.
  const closeCard = (): void => {
    setStep('mode');
  };

  if (step === 'mode') {
    // R9: 매니페스트가 비어 있으면 "녹음 음성으로 듣기" 옵션은 의미가 없다.
    //   - 어떤 텍스트를 눌러도 lookupPrerecorded miss → SpeechSynth로 떨어진다.
    //   - 사용자에게 약 20~40MB 다운로드를 권하면서 실제로는 받을 게 없는
    //     상황이 되므로 옵션 자체를 숨긴다(개발/스테이징 빌드 케이스).
    const recordedAvailable = getManifestSize() > 0;
    return (
      <section className="rounded-2xl border-2 border-primary/30 bg-primary-soft p-4 sm:p-5">
        <p className="text-base font-bold text-fg">
          음성 재생 방식을 골라 주세요
        </p>
        <p className="text-sm text-fg/80 mt-1">
          나중에 설정에서 바꿀 수 있어요.
        </p>
        <div className={cn(
          'mt-4 grid gap-3',
          recordedAvailable ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
        )}>
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
          {recordedAvailable && (
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
          )}
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
