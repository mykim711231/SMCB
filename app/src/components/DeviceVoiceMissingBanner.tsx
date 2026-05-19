/**
 * 기기 음성 모드인데 단말기에 중국어(zh-CN) 음성팩이 감지되지 않을 때만
 * Home 상단에 노출되는 사전 경고 배너.
 *
 * 동작 흐름:
 *  1. userMode === 'device' 일 때만 표시
 *  2. awaitVoices()로 voiceschanged 도착까지 대기 (Chrome async voice load)
 *  3. zh- 로 시작하는 voice가 0개이면 배너 렌더
 *
 * 제공 액션:
 *  - 도움말 보기 (/help — TTSDiagnostic + InstallGuide 포함)
 *  - 녹음 음성으로 전환 (한 번 클릭으로 안전 모드 진입)
 *
 * 사용자가 재생을 시도해서 alert가 뜨기 전에 미리 알려주는 게 목적.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, FileAudio, HelpCircle } from 'lucide-react';
import { awaitVoices, isSupported } from '@/lib/tts';
import { useSettings } from '@/stores/settings';

export default function DeviceVoiceMissingBanner(): JSX.Element | null {
  const hydrated = useSettings((s) => s.hydrated);
  const userMode = useSettings((s) => s.userMode);
  const setUserMode = useSettings((s) => s.setUserMode);
  const [checked, setChecked] = useState(false);
  const [zhCount, setZhCount] = useState<number | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (userMode !== 'device') {
      // device 모드가 아니면 체크 불필요 (state 리셋)
      setChecked(false);
      setZhCount(null);
      return;
    }
    if (!isSupported()) {
      setChecked(true);
      setZhCount(0);
      return;
    }
    let cancelled = false;
    void awaitVoices().then((vs) => {
      if (cancelled) return;
      const zh = vs.filter((v) => v.lang.toLowerCase().startsWith('zh')).length;
      setZhCount(zh);
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, userMode]);

  if (!hydrated) return null;
  if (userMode !== 'device') return null;
  if (!checked) return null;
  if ((zhCount ?? 0) > 0) return null;

  return (
    <section className="rounded-2xl border-2 border-accent bg-accent/10 p-4 sm:p-5">
      <p className="font-bold text-fg inline-flex items-center gap-1.5">
        <AlertTriangle size={18} aria-hidden /> 이 기기에 중국어 음성팩이 없어요
      </p>
      <p className="text-sm text-fg/90 mt-2">
        지금 <b>기기 음성</b>으로 설정돼 있는데, 단말기에서 <b>중국어(zh-CN) 음성</b>이
        감지되지 않습니다. 그대로 재생 버튼을 눌러도 소리가 나지 않을 수 있어요.
      </p>
      <p className="text-sm text-fg mt-2 font-semibold">▸ 두 가지 선택</p>
      <ul className="list-disc pl-5 text-sm text-fg/90 space-y-1 mt-1">
        <li>
          <b>도움말</b>의 안내를 따라 단말기에 <b>중국어 음성팩</b>을 설치한다.
          (Windows · Mac · Android · iPhone 각각 다른 경로)
        </li>
        <li>
          간단히 <b>녹음 음성</b>으로 전환한다. 한 번 다운로드(약 20~40MB)하면
          오프라인에서도 그대로 들을 수 있어요.
        </li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to="/help"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-4 py-2"
        >
          <HelpCircle size={14} aria-hidden />
          도움말 보기
        </Link>
        <button
          type="button"
          onClick={() => setUserMode('recorded')}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface text-fg text-sm font-semibold px-4 py-2 border border-divider"
        >
          <FileAudio size={14} aria-hidden />
          녹음 음성으로 전환
        </button>
      </div>
    </section>
  );
}
