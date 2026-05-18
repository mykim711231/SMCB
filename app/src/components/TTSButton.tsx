import { useEffect, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { speak, stop, isSupported, unlock } from '@/lib/tts';
import { useSettings } from '@/stores/settings';
import { cn } from '@/lib/cn';

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
      onError: () => setSpeaking(false),
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
