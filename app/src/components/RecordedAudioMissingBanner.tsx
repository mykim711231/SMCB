/**
 * 녹음 음성 모드인데 mp3 일괄 다운로드가 안 끝났고 + 현재 오프라인 상태일 때
 * Home 상단에 노출되는 사전 경고 배너.
 *
 * 동작 흐름:
 *  1. userMode === 'recorded' 일 때만 대상
 *  2. ttsBulkStatus가 'done' 이면 캐시 충분 — 노출 안 함
 *  3. navigator.onLine === false 이면 노출 — fetch가 실패하면 synth fallback도
 *     단말기 음성팩이 없으면 또 실패하는 이중 실패 시나리오를 사전 경고
 *  4. online/offline 이벤트로 재검사 — Wi-Fi 복귀하면 배너 자동 사라짐
 *
 * 제공 액션:
 *  - 설정에서 일괄 다운로드 받기 (/settings)
 *  - 기기 음성으로 전환 (한 번 클릭)
 *
 * device 모드 사용자에겐 표시 안 함 — DeviceVoiceMissingBanner와 동시 출현
 * 회피 + 모드별 책임 분리.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Smartphone, WifiOff, Download } from 'lucide-react';
import { stop as stopTTS } from '@/lib/tts';
import { useSettings } from '@/stores/settings';

function readOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  // navigator.onLine은 일부 OS에서 거짓 양성을 줄 수 있지만, 음성 재생은
  // 사용자 액션이라 false-negative만 막으면 충분 (true → 표시 안 함).
  return navigator.onLine !== false;
}

export default function RecordedAudioMissingBanner(): JSX.Element | null {
  const hydrated = useSettings((s) => s.hydrated);
  const userMode = useSettings((s) => s.userMode);
  const ttsBulkStatus = useSettings((s) => s.ttsBulkStatus);
  const ttsBulkProgress = useSettings((s) => s.ttsBulkProgress);
  const setUserMode = useSettings((s) => s.setUserMode);
  const [online, setOnline] = useState<boolean>(readOnline());

  useEffect(() => {
    const onOnline = (): void => setOnline(true);
    const onOffline = (): void => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!hydrated) return null;
  if (userMode !== 'recorded') return null;
  // 'done'은 모든 mp3가 캐시 됨 — 오프라인이어도 안전.
  if (ttsBulkStatus === 'done') return null;
  // 온라인이면 fetch가 일단 통과 — 사전 경고 불필요.
  // (실제 재생 실패는 TTSButton의 onError가 한 번 안내함)
  if (online) return null;

  const switchToDevice = (): void => {
    try { stopTTS(); } catch { /* ignore */ }
    setUserMode('device');
  };

  const partial = ttsBulkStatus === 'partial' && ttsBulkProgress.done > 0;

  return (
    <section className="rounded-2xl border-2 border-accent bg-accent/10 p-4 sm:p-5">
      <p className="font-bold text-fg inline-flex items-center gap-1.5">
        <AlertTriangle size={18} aria-hidden /> 오프라인 + 녹음 음성 다운로드 미완료
      </p>
      <p className="text-sm text-fg/90 mt-2 inline-flex items-center gap-1.5">
        <WifiOff size={14} aria-hidden />
        지금 인터넷에 연결되어 있지 않고, 녹음 음성도 아직 받지 않았습니다.
      </p>
      <p className="text-sm text-fg/90 mt-2">
        {partial ? (
          <>일부({ttsBulkProgress.done}/{ttsBulkProgress.total})만 받아진 상태라 받지 못한 절은 소리가 나지 않을 수 있어요.</>
        ) : (
          <>이 상태로 재생 버튼을 눌러도 mp3를 가져올 수 없어 소리가 나지 않을 수 있어요.</>
        )}
      </p>
      <p className="text-sm text-fg mt-2 font-semibold">▸ 두 가지 선택</p>
      <ul className="list-disc pl-5 text-sm text-fg/90 space-y-1 mt-1">
        <li>
          Wi-Fi/데이터 연결 후 <b>설정 → 음성 다운로드</b>에서 한 번 받아두기.
          (약 20~40MB, 이후 오프라인에서도 그대로 들립니다.)
        </li>
        <li>
          단말기에 중국어 음성팩이 있다면 <b>기기 음성</b>으로 전환해 즉시 사용.
        </li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-4 py-2"
        >
          <Download size={14} aria-hidden />
          설정에서 받기
        </Link>
        <button
          type="button"
          onClick={switchToDevice}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface text-fg text-sm font-semibold px-4 py-2 border border-divider"
        >
          <Smartphone size={14} aria-hidden />
          기기 음성으로 전환
        </button>
      </div>
    </section>
  );
}
