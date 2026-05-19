/**
 * Hanzi-syllable alignment for per-character ruby rendering.
 *
 * Pairs each hanzi character with its pinyin syllable so the UI can show
 * each pinyin directly above the corresponding character (Naver / Pagoda
 * style). Non-CJK characters (punctuation, ASCII letters, digits) pass
 * through with `py: ''` so they flow inline with the rest of the line.
 *
 * Returns `null` when the syllable count does not match the hanzi count —
 * the caller should fall back to the legacy block layout to avoid
 * presenting misaligned reading aids.
 */
const CJK_RE = /[㐀-䶿一-鿿]/;

// One Mandarin pinyin syllable:
//   optional initial (b/p/m/f/d/t/n/l/g/k/h/j/q/x/r/z/c/s/y/w, with optional 'h' for zh/ch/sh),
//   one or more vowels (incl. tone marks + ü/v),
//   optional ending n / ng / r (儿化).
//
// Apostrophes in pinyin like "Xī'ān" simply break the match boundary so
// each side is captured as its own syllable, which is exactly what we want.
const SYL_RE =
  /(?:[bpmfdtnlgkhjqxrzcsywBPMFDTNLGKHJQXRZCSYW]h?)?[aeiouüvAEIOUÜVāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]+(?:ng|n|r|NG|N|R)?/g;

export type RubyToken = { ch: string; py: string };

export function tokenizePinyinSyllables(pinyin: string): string[] {
  if (!pinyin) return [];
  return Array.from(pinyin.matchAll(SYL_RE)).map((m) => m[0]);
}

export function alignRuby(zh: string, pinyin: string): RubyToken[] | null {
  if (!zh || !pinyin) return null;
  const syllables = tokenizePinyinSyllables(pinyin);
  const chars = Array.from(zh);
  const hanziCount = chars.reduce((n, c) => (CJK_RE.test(c) ? n + 1 : n), 0);
  if (hanziCount === 0 || hanziCount !== syllables.length) return null;

  const tokens: RubyToken[] = [];
  let i = 0;
  for (const c of chars) {
    if (CJK_RE.test(c)) {
      tokens.push({ ch: c, py: syllables[i++] });
    } else {
      // Whitespace inside zh is rare; collapse to keep layout tidy.
      if (/\s/.test(c)) continue;
      tokens.push({ ch: c, py: '' });
    }
  }
  return tokens;
}
