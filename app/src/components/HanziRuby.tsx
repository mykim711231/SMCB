import type { RubyToken } from '@/lib/pinyinRuby';
import { cn } from '@/lib/cn';

type Props = {
  tokens: RubyToken[];
  /** Optional speaker-role prefix (e.g. "A:" / "Q:"). Rendered in muted color. */
  prefix?: string;
  className?: string;
};

/**
 * Per-character pinyin ruby layout — each hanzi shows its own pinyin
 * syllable directly above it (Naver / Pagoda style). Non-CJK chars
 * (punctuation, ASCII) pass through with no pinyin slot, keeping the
 * line readable and wrap-friendly.
 */
export default function HanziRuby({ tokens, prefix, className }: Props): JSX.Element {
  return (
    <div className={cn('flex flex-wrap items-end gap-x-0.5 gap-y-1 select-text', className)}>
      {prefix && (
        <span className="inline-flex flex-col items-center leading-none mr-1">
          <span className="h-5 sm:h-6" aria-hidden />
          <span className="text-fg/70 text-xl sm:text-2xl font-medium">{prefix}</span>
        </span>
      )}
      {tokens.map((t, i) => (
        <span key={i} className="inline-flex flex-col items-center leading-none">
          <span
            aria-hidden
            className="text-pinyin font-pinyin text-base sm:text-lg h-5 sm:h-6 leading-none whitespace-nowrap"
          >
            {t.py || ' '}
          </span>
          <span
            className={
              t.mark
                ? 'text-primary font-bold text-xl sm:text-2xl leading-tight px-0.5'
                : 'text-fg text-xl sm:text-2xl font-medium leading-tight'
            }
            aria-hidden={t.mark || undefined}
          >
            {t.ch}
          </span>
        </span>
      ))}
    </div>
  );
}
