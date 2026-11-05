/**
 * Hanzi-syllable alignment for per-character ruby rendering.
 *
 * Pairs each hanzi character with its pinyin syllable so the UI can show
 * each pinyin directly above the corresponding character (Naver / Pagoda
 * style). Non-CJK characters (punctuation, ASCII letters, digits) pass
 * through with `py: ''` so they flow inline with the rest of the line.
 *
 * 儿화(érhuà) — 「儿」 is its own hanzi but its pinyin fuses into the
 * preceding syllable as a trailing `r` (狗儿 → "gǒur"). Such 「儿」 carry no
 * syllable of their own; alignRuby detects them and renders 「儿」 with an
 * empty pinyin slot instead of giving up on the whole line.
 *
 * Returns `null` when the syllables still cannot be matched to the hanzi —
 * the caller should fall back to the legacy block layout to avoid
 * presenting misaligned reading aids.
 */
const CJK_RE = /[㐀-䶿一-鿿]/;

// Pinyin vowels — plain, ü/v, every tone mark, both cases.
const VOWELS =
  'aeiouüvAEIOUÜVāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ';

// One Mandarin pinyin syllable:
//   - optional initial (b/p/m/… with optional 'h' for zh/ch/sh),
//   - one or more vowels (incl. tone marks + ü/v),
//   - optional nasal coda n / ng,
//   - optional 儿화(érhuà) r.
//
// A coda (n/ng/r) is rejected when immediately followed by a vowel: in
// well-formed pinyin a vowel-initial syllable is apostrophe-separated, so a
// consonant sitting before a vowel must be the *onset* of the next syllable.
// This prevents false splits such as "kěnéng" → "kěn/éng", "bǐrú" → "bǐr/ú"
// or "jiārén" → "jiār/én".
//
// The nasal coda and the érhuà r are kept as separate optional groups so an
// érhuà syllable built on an -n final ("diǎnr", "wánr", "mànmànr") is
// captured whole instead of dropping its trailing r.
//
// Apostrophes in pinyin like "Xī'ān" simply break the match boundary so
// each side is captured as its own syllable, which is exactly what we want.
const SYL_RE = new RegExp(
  '(?:[bpmfdtnlgkhjqxrzcsywBPMFDTNLGKHJQXRZCSYW]h?)?' +
    `[${VOWELS}]+` +
    `(?:(?:ng|n|NG|N)(?![${VOWELS}]))?` +
    `(?:[rR](?![${VOWELS}]))?`,
  'g',
);

// 儿화 대상 글자 (간체 儿 / 번체 兒).
const ERHUA_CHAR_RE = /^[儿兒]$/;

/** `mark`: 끊어 읽기 표시(간격·"/"·"//")용 토큰 — 원문 글자가 아님. */
export type RubyToken = { ch: string; py: string; mark?: 'gap' | 'phrase' | 'clause' };

export function tokenizePinyinSyllables(pinyin: string): string[] {
  if (!pinyin) return [];
  return Array.from(pinyin.matchAll(SYL_RE)).map((m) => m[0]);
}

/** 각 음절이 끝나는 문자열 오프셋(끝 위치, exclusive) 목록. */
export function pinyinSyllableEnds(pinyin: string): number[] {
  if (!pinyin) return [];
  return Array.from(pinyin.matchAll(SYL_RE)).map((m) => (m.index ?? 0) + m[0].length);
}

export function alignRuby(zh: string, pinyin: string): RubyToken[] | null {
  if (!zh || !pinyin) return null;
  const syllables = tokenizePinyinSyllables(pinyin);
  const chars = Array.from(zh);
  const hanziCount = chars.reduce((n, c) => (CJK_RE.test(c) ? n + 1 : n), 0);
  if (hanziCount === 0) return null;

  // 한자 수 - 음절 수 = 부족분. 음수면 병음이 더 많아 정렬 불가.
  // 부족분은 儿화 「儿」(자체 음절 없음)의 개수로 정확히 설명돼야 한다.
  const deficit = hanziCount - syllables.length;
  if (deficit < 0) return null;
  let erhuaLeft = deficit;

  const tokens: RubyToken[] = [];
  let i = 0;
  for (const c of chars) {
    if (!CJK_RE.test(c)) {
      // Whitespace inside zh is rare; collapse to keep layout tidy.
      if (/\s/.test(c)) continue;
      tokens.push({ ch: c, py: '' });
      continue;
    }
    // 앞 음절이 r로 끝나는 「儿」 → 儿화로 보고 음절을 소비하지 않는다.
    if (
      erhuaLeft > 0 &&
      ERHUA_CHAR_RE.test(c) &&
      i > 0 &&
      /[rR]$/.test(syllables[i - 1] ?? '')
    ) {
      tokens.push({ ch: c, py: '' });
      erhuaLeft -= 1;
      continue;
    }
    if (i >= syllables.length) return null;
    tokens.push({ ch: c, py: syllables[i++] });
  }

  // 모든 음절이 정확히 소비되고 부족분이 儿화로 모두 설명돼야 정렬 성공.
  if (i !== syllables.length || erhuaLeft !== 0) return null;
  return tokens;
}
