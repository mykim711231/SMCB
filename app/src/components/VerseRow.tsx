import type { Verse } from '@/types/lesson';
import TTSButton from './TTSButton';
import HanziRuby from './HanziRuby';
import { useSettings } from '@/stores/settings';
import { cn } from '@/lib/cn';
import { alignRuby } from '@/lib/pinyinRuby';

type Props = {
  verse: Verse;
  tts?: boolean;
  className?: string;
  /** Allow callers (e.g. dialogs) to render a role prefix before the hanzi. */
  prefix?: string;
};

/**
 * Trilingual verse — Hanzi (large), pinyin (above), Korean (below).
 * Visibility per language is driven by global Settings toggles.
 *
 * When `rubyPinyin` is enabled and the hanzi/pinyin syllable counts match,
 * we render per-character ruby instead of separate pinyin + hanzi blocks
 * (Naver / Pagoda style). Misaligned verses gracefully fall back to the
 * block layout so the user never sees skewed reading aids.
 */
export default function VerseRow({ verse, tts = true, className, prefix }: Props): JSX.Element {
  const { showHanzi, showPinyin, showKorean, rubyPinyin } = useSettings();
  const tokens =
    showHanzi && showPinyin && rubyPinyin ? alignRuby(verse.zh, verse.pinyin) : null;

  return (
    <div className={cn('flex gap-3 items-start py-2', className)}>
      {tts && (
        <div className="pt-1 shrink-0">
          <TTSButton text={verse.zh} size="sm" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {tokens ? (
          <HanziRuby tokens={tokens} prefix={prefix} />
        ) : (
          <>
            {showPinyin && (
              <p className="text-pinyin font-pinyin text-sm leading-snug select-text">
                {verse.pinyin}
              </p>
            )}
            {showHanzi && (
              <p className="text-fg text-xl sm:text-2xl leading-snug font-medium select-text">
                {prefix ? <span className="text-muted mr-1">{prefix}</span> : null}
                {verse.zh}
              </p>
            )}
          </>
        )}
        {showKorean && (
          <p className="text-fg/90 text-base leading-snug mt-1 select-text">
            {verse.ko}
          </p>
        )}
      </div>
    </div>
  );
}
