import { useEffect, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { speak, stop, isSupported, unlock, isIOS, isStandalonePWA, getVoices } from '@/lib/tts';
import { useSettings } from '@/stores/settings';
import { cn } from '@/lib/cn';

let ttsErrorShown = false;

function ttsErrorMessage(err: SpeechSynthesisErrorEvent | null): string {
  const lines: string[] = ['중국어 음성을 재생할 수 없습니다.'];
  if (isIOS()) {
    lines.push(
      '',
      '【아이폰 음성팩 설치】',
      '설정 → 손쉬운 사용 → 음성 콘텐츠 → 음성 → 중국어 → "중국어(중국 본토)" 또는 "보통화" 다운로드',
    );
    if (isStandalonePWA()) {
      lines.push(
        '',
        '※ 홈 화면에 설치한 앱(PWA)에서는 iOS 17.4 미만에서 음성이 막힐 수 있습니다. Safari 탭으로 열어 보세요.',
      );
    }
  } else {
    lines.push(
      '',
      '단말기에 중국어(zh-CN) 음성이 설치되어 있는지 확인해 주세요.',
    );
  }
  const zhVoices = getVoices().filter((v) => v.lang.toLowerCase().startsWith('zh'));
  lines.push('', `감지된 중국어 음성: ${zhVoices.length}개`);
  if (err?.error) lines.push(`오류 코드: ${err.error}`);
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
  const { ttsRate, ttsVoiceURI } = useSettings();

  useEffect(() => {
    // Tear down on unmount
    return () => {
      if (speaking) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupported()) return null;

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
      onEnd: () => setSpeaking(false),
      onError: (e) => {
        setSpeaking(false);
        // 'canceled' / 'interrupted'는 사용자가 중지한 정상 흐름
        if (e?.error === 'canceled' || e?.error === 'interrupted') return;
        if (ttsErrorShown) return;
        ttsErrorShown = true;
        alert(ttsErrorMessage(e));
      },
    });
  };

  const dim = size === 'sm' ? 'w-9 h-9' : 'w-11 h-11';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={speaking ? '중지' : label}
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
