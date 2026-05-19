import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Volume2, Square } from 'lucide-react';
import { speak, stop, isSupported, unlock, isIOS, isStandalonePWA, awaitVoices, prefetchAudio } from '@/lib/tts';
import { useSettings } from '@/stores/settings';
import { cn } from '@/lib/cn';

let ttsErrorShown = false;

function ttsErrorReason(code: string | undefined): string | null {
  switch (code) {
    case 'language-unavailable':
    case 'voice-unavailable':
      return '단말기에 중국어 음성팩이 설치되어 있지 않습니다.';
    case 'audio-busy':
      return '다른 앱이 오디오를 사용 중입니다. 다른 음성·통화를 잠시 멈추고 다시 시도해 주세요.';
    case 'audio-hardware':
      return '오디오 장치에 접근할 수 없습니다. Bluetooth 연결을 해제하거나 단말기를 다시 시작해 보세요.';
    case 'network':
      return '네트워크가 필요한 음성입니다. Wi-Fi/데이터 연결을 확인하세요.';
    case 'synthesis-failed':
    case 'synthesis-unavailable':
      return '음성 합성에 실패했습니다. 단말기를 다시 시작하면 대부분 해결됩니다.';
    case 'not-allowed':
      return '브라우저가 자동 재생을 차단했습니다. 화면의 ▶ 버튼을 한 번 직접 눌러 주세요.';
    default:
      return null;
  }
}

async function ttsErrorMessage(err: SpeechSynthesisErrorEvent | null): Promise<string> {
  const lines: string[] = ['중국어 음성을 재생할 수 없습니다.'];
  const reason = ttsErrorReason(err?.error);
  if (reason) {
    lines.push('', `원인: ${reason}`);
  }
  if (isIOS()) {
    lines.push(
      '',
      '【아이폰 음성팩 설치】',
      '설정 → 손쉬운 사용 → 음성 콘텐츠 → 음성 → 중국어 → "중국어(중국 본토)" 또는 "보통화" 다운로드',
      '',
      '【볼륨 확인】',
      'iPhone은 음성을 "벨소리·알림 볼륨"으로 재생합니다.',
      '설정 → 사운드 및 햅틱 → 벨소리와 알림 볼륨 슬라이더를 올리거나, 무음 스위치를 꺼 주세요.',
    );
    if (isStandalonePWA()) {
      lines.push(
        '',
        '※ 홈 화면에 설치한 앱(PWA)에서는 다음 두 구간에서 음성이 막힐 수 있습니다.',
        '  • iOS 17.4 미만 — Apple이 PWA SpeechSynthesis 버그를 17.4에서 수정',
        '  • iOS 26.0 · 26.1 — 회귀 보고됨 (포럼 다수 사례, 26.2 이상에서 수정 예정)',
        '안 들리면 페이지를 Safari 탭으로 열어 보세요.',
      );
    }
  } else {
    lines.push(
      '',
      '단말기에 중국어(zh-CN) 음성이 설치되어 있는지 확인해 주세요.',
    );
  }
  // voiceschanged 이벤트는 Chrome에서 비동기로 도착 — 동기 getVoices()는
  // 음성팩이 실제로 설치돼 있어도 첫 호출에서 빈 배열을 반환할 수 있다.
  // awaitVoices()로 확정한 뒤 표시해야 "감지된 중국어 음성: 0개" 오표시 회피.
  const allVoices = await awaitVoices();
  const zhVoices = allVoices.filter((v) => v.lang.toLowerCase().startsWith('zh'));
  lines.push('', `감지된 중국어 음성: ${zhVoices.length}개`);
  lines.push('', '※ [확인]을 누르면 도움말 페이지로 이동해 자세한 진단을 볼 수 있어요.');
  return lines.join('\n');
}

type Props = {
  text: string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
};

export default function TTSButton({ text, label = '소리 듣기', size = 'md', className }: Props): JSX.Element | null {
  const [speaking, setSpeaking] = useState(false);
  const navigate = useNavigate();
  const ttsRate = useSettings((s) => s.ttsRate);
  const ttsVoiceURI = useSettings((s) => s.ttsVoiceURI);
  const userMode = useSettings((s) => s.userMode);
  const speakingRef = useRef(false);
  // userMode null(미선택)은 'recorded'와 동일하게 처리 — 가장 안정적.
  const voiceMode: 'device' | 'recorded' = userMode === 'device' ? 'device' : 'recorded';

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    return () => {
      if (speakingRef.current) stop();
    };
  }, []);

  if (!isSupported()) return null;

  // 클릭 직전(mousedown/touchstart)에 mp3 prefetch — 첫 클릭에서
  // play()가 cold network로 실패하던 문제를 줄인다.
  // click 이벤트보다 50~150ms 빨리 발생하므로 그 사이 audio buffer 시작.
  // device 모드는 mp3를 안 쓰므로 prefetchAudio가 내부 no-op.
  const onPointerDown = (): void => {
    if (speakingRef.current) return;
    prefetchAudio(text, voiceMode);
  };

  const onClick = (): void => {
    unlock();
    if (speaking) {
      stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(text, {
      rate: ttsRate,
      voiceURI: ttsVoiceURI ?? undefined,
      voiceMode,
      onEnd: () => setSpeaking(false),
      onError: (e) => {
        setSpeaking(false);
        // 'canceled' / 'interrupted'는 사용자가 중지한 정상 흐름
        if (e?.error === 'canceled' || e?.error === 'interrupted') return;
        if (ttsErrorShown) return;
        ttsErrorShown = true;
        // 비동기 — awaitVoices()로 voiceschanged 도착까지 대기 후 표시.
        // 동기 alert가 즉시 뜨던 기존 흐름에서는 음성팩이 설치돼 있어도
        // "0개"로 나오는 false-negative가 있었음.
        void ttsErrorMessage(e).then((msg) => {
          const goHelp = confirm(msg + '\n\n도움말 페이지로 이동할까요?');
          if (goHelp) navigate('/help');
        });
      },
    });
  };

  const dim = size === 'sm' ? 'w-9 h-9' : 'w-11 h-11';
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      aria-label={label}
      aria-pressed={speaking}
      className={cn(
        'inline-flex items-center justify-center rounded-full border transition-colors',
        dim,
        speaking
          ? 'bg-primary text-white border-primary'
          : 'bg-surface text-primary border-divider hover:bg-primary-soft',
        className,
      )}
    >
      {speaking ? <Square size={16} aria-hidden /> : <Volume2 size={18} aria-hidden />}
    </button>
  );
}
