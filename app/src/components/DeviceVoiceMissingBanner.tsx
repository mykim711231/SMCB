/**
 * 기기 음성 모드인데 단말기에 중국어(zh-CN) 음성팩이 감지되지 않을 때만
 * Home 상단에 노출되는 사전 경고 배너.
 *
 * 동작 흐름:
 *  1. userMode === 'device' 일 때만 표시
 *  2. awaitVoices()로 voiceschanged 도착까지 대기 (Chrome async voice load)
 *  3. mount 이후에도 voiceschanged / visibilitychange 시 재검사 — 사용자가
 *     설정 앱에서 중국어 음성팩을 설치하고 돌아오면 배너가 자동으로 사라진다.
 *
 * 메시지 분기:
 *  - 엔진 자체가 없음(SpeechSynthesis 미지원) → "이 브라우저는 기기 음성 미지원"
 *  - 엔진은 있지만 zh 음성 0개 → "중국어 음성팩 미설치" + 설치 안내
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
import { awaitVoices, getVoices, isSupported, stop as stopTTS } from '@/lib/tts';
import { useSettings } from '@/stores/settings';

/**
 * - 'no-engine'    : SpeechSynthesis API 자체가 없음
 * - 'no-voice'     : zh 음성 0개 (어떤 변종도 없음) — 음성팩 미설치
 * - 'only-zh-tw'   : zh-TW(번체/대만) 변종만 있음. 본 교재는 zh-CN(간체/보통화)
 *                    기반이라 한자음·일부 어휘가 mismatch. 사용자는 "소리는
 *                    나는데 발음이 이상하다"고만 느껴 silent quality fail.
 *                    명시적 안내로 zh-CN 설치 유도.
 */
type BannerKind = 'no-engine' | 'no-voice' | 'only-zh-tw' | null;

// 본 교재는 보통화(普通话) 기준 — 명시적으로 본토/싱가포르 변종을 적합으로 인정.
// zh-HK/zh-TW만 있는 경우 발음 mismatch 위험이 커서 별도 안내.
const ZH_CN_LIKE_RE = /^zh(-|_)?(cn|sg|hans)/i;

export default function DeviceVoiceMissingBanner(): JSX.Element | null {
  const hydrated = useSettings((s) => s.hydrated);
  const userMode = useSettings((s) => s.userMode);
  const setUserMode = useSettings((s) => s.setUserMode);
  const [kind, setKind] = useState<BannerKind>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (userMode !== 'device') {
      setChecked(false);
      setKind(null);
      return;
    }
    if (!isSupported()) {
      // SpeechSynthesis API 자체 없음 (예: 일부 인앱 브라우저).
      setKind('no-engine');
      setChecked(true);
      return;
    }

    let cancelled = false;
    const evaluate = (): void => {
      if (cancelled) return;
      const zhAll = getVoices().filter((v) => v.lang.toLowerCase().startsWith('zh'));
      if (zhAll.length === 0) {
        setKind('no-voice');
      } else if (zhAll.some((v) => ZH_CN_LIKE_RE.test(v.lang))) {
        // 본토/싱가포르 변종이 하나라도 있으면 ok — pickMandarinVoice가 선택.
        setKind(null);
      } else {
        // zh-TW/zh-HK 등만 있는 환경 — 한자음 mismatch 위험.
        setKind('only-zh-tw');
      }
      setChecked(true);
    };

    void awaitVoices().then(() => {
      if (cancelled) return;
      evaluate();
    });

    // 사용자가 OS 설정에서 음성팩을 설치하고 돌아오면 voiceschanged가 발화한다.
    // visibilitychange는 voiceschanged를 발화하지 않는 OS(iOS) 대비 fallback.
    const synth = window.speechSynthesis;
    const onVoicesChanged = (): void => evaluate();
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') evaluate();
    };
    synth.addEventListener('voiceschanged', onVoicesChanged);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      synth.removeEventListener('voiceschanged', onVoicesChanged);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hydrated, userMode]);

  if (!hydrated) return null;
  if (userMode !== 'device') return null;
  if (!checked) return null;
  if (kind === null) return null;

  const switchToRecorded = (): void => {
    // 모드 전환은 setUserMode 내부에서 stop()을 호출하지만,
    // 명시적으로 한 번 더 호출해 batched setState 전에 in-flight 음성 차단.
    try { stopTTS(); } catch { /* ignore */ }
    setUserMode('recorded');
  };

  if (kind === 'no-engine') {
    return (
      <section className="rounded-2xl border-2 border-accent bg-accent/10 p-4 sm:p-5">
        <p className="font-bold text-fg inline-flex items-center gap-1.5">
          <AlertTriangle size={18} aria-hidden /> 이 브라우저는 기기 음성을 지원하지 않아요
        </p>
        <p className="text-sm text-fg/90 mt-2">
          현재 브라우저에서 <b>SpeechSynthesis API</b>가 제공되지 않아
          기기 음성 모드로는 소리가 나지 않습니다.
        </p>
        <p className="text-sm text-fg/90 mt-2">
          기본 브라우저(Safari/Chrome 등)로 열거나, <b>녹음 음성</b>으로
          전환하면 안정적으로 재생할 수 있어요.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={switchToRecorded}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-4 py-2"
          >
            <FileAudio size={14} aria-hidden />
            녹음 음성으로 전환
          </button>
          <Link
            to="/help"
            className="inline-flex items-center gap-1.5 rounded-full bg-surface text-fg text-sm font-semibold px-4 py-2 border border-divider"
          >
            <HelpCircle size={14} aria-hidden />
            도움말 보기
          </Link>
        </div>
      </section>
    );
  }

  if (kind === 'only-zh-tw') {
    return (
      <section className="rounded-2xl border-2 border-accent bg-accent/10 p-4 sm:p-5">
        <p className="font-bold text-fg inline-flex items-center gap-1.5">
          <AlertTriangle size={18} aria-hidden /> 본토 중국어(zh-CN) 음성이 없어요
        </p>
        <p className="text-sm text-fg/90 mt-2">
          이 기기에는 <b>대만 중국어(zh-TW)</b> 또는 <b>광동어(zh-HK)</b> 음성만 있어
          본 교재의 한자가 본래 발음과 다르게 들릴 수 있습니다.
          (예: 일부 한자음·성조·어휘 차이)
        </p>
        <p className="text-sm text-fg mt-2 font-semibold">▸ 권장</p>
        <ul className="list-disc pl-5 text-sm text-fg/90 space-y-1 mt-1">
          <li>
            <b>도움말</b>에서 <b>중국어(중국 본토 / 보통화)</b> 음성팩을 추가로 설치.
          </li>
          <li>
            번거롭다면 <b>녹음 음성</b>으로 전환하면 일관된 본토 발음으로 들립니다.
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
            onClick={switchToRecorded}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface text-fg text-sm font-semibold px-4 py-2 border border-divider"
          >
            <FileAudio size={14} aria-hidden />
            녹음 음성으로 전환
          </button>
        </div>
      </section>
    );
  }

  // no-voice
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
          onClick={switchToRecorded}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface text-fg text-sm font-semibold px-4 py-2 border border-divider"
        >
          <FileAudio size={14} aria-hidden />
          녹음 음성으로 전환
        </button>
      </div>
    </section>
  );
}
