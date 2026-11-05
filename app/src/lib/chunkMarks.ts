/**
 * 끊어 읽기 표시 — 문장 안에 "/" 를 넣어 의미 단위(구/절)로 끊어 읽도록 돕는다.
 *
 * 레벨 (학습자 수준 기준, 숫자가 클수록 덩어리가 커진다):
 *   - beginner     초급: 쉼표 + 접속사 + 전치/개사(在·把·被·对…) + 긴 "…的" 뒤에서 잘게 끊는다.
 *   - intermediate 중급: 쉼표 + 접속사(因为·所以·但是·甚至…) 앞에서 끊는다.
 *   - advanced     고급: 쉼표·모점만 (문장 흐름을 학습자가 직접 판단).
 *
 * 규칙 기반 휴리스틱이라 형태소 분석처럼 완벽하지 않다. 너무 짧은 덩어리(앞/뒤)는
 * 만들지 않도록 최소 길이를 둔다. 문장 맨 끝 부호에는 표시하지 않는다.
 * 원문(zh/pinyin) 데이터와 TTS는 바꾸지 않고 화면 표시에만 적용한다.
 */
import { tokenizeChinese } from '@/lib/zh-tokenize';
import { alignRuby, pinyinSyllableEnds, type RubyToken } from '@/lib/pinyinRuby';

export type ChunkLevel = 'off' | 'beginner' | 'intermediate' | 'advanced';

export const CHUNK_LEVELS: ChunkLevel[] = ['off', 'beginner', 'intermediate', 'advanced'];

/** 끊어 읽기 대상 부호: 전각 쉼표·모점·세미콜론·콜론 + 병음용 ASCII. */
const HARD_RE = /[，、；：,;:]/;
const SENTENCE_END_RE = /[。！？!?.…]/;

const CONJ = ['因为', '所以', '但是', '可是', '而且', '如果', '虽然', '然后', '甚至', '因此', '并且', '或者', '不但', '而是', '为了', '如同'];
const PREP = ['在', '把', '被', '对', '向', '从', '跟', '与', '让', '使', '将'];

const PARAMS = {
  // minBefore: 앞 덩어리 최소 글자, cap: 덩어리 최대 글자(넘기 전에 단어 경계에서 끊음)
  beginner: { minBefore: 2, cap: 6, deLen: 5 },
  intermediate: { minBefore: 4, cap: 9, deLen: 8 },
} as const;
const MIN_AFTER = 2;

export function isChunkBreak(ch: string): boolean {
  return HARD_RE.test(ch);
}

type Word = { start: number; len: number; text: string };

/** 구두점으로 끝나는 한 절(clause)을 단어로 나눈다. 단어 합이 원문과 다르면 절 전체를 한 단어로 취급. */
function wordsOf(chars: string[], from: number, to: number): Word[] {
  const clause = chars.slice(from, to).join('');
  const tokens = tokenizeChinese(clause);
  if (tokens.join('') !== clause) return [{ start: from, len: to - from, text: clause }];
  const out: Word[] = [];
  let o = from;
  for (const t of tokens) {
    out.push({ start: o, len: t.length, text: t });
    o += t.length;
  }
  return out;
}

/**
 * 각 글자 뒤에서 끊을지 계산한다. 반환: "i번째 글자 뒤에 / 표시" 인 i의 집합.
 * 쉼표류는 모든 레벨에서 끊고, 초급/중급은 절 안에서 단어 경계 기준으로 더 나눈다.
 */
export function chunkBreaks(chars: string[], level: ChunkLevel): Set<number> {
  const out = new Set<number>();
  if (level === 'off') return out;

  let last = chars.length - 1;
  while (last >= 0 && /\s/.test(chars[last])) last -= 1;

  // 절 경계 수집 + 쉼표류 표시
  let clauseStart = 0;
  const clauses: Array<[number, number]> = [];
  for (let i = 0; i <= last + 1; i += 1) {
    const c = i <= last ? chars[i] : '';
    const isEnd = i > last || HARD_RE.test(c) || SENTENCE_END_RE.test(c) || /\s/.test(c);
    if (!isEnd) continue;
    if (i > clauseStart) clauses.push([clauseStart, i]);
    if (i <= last && HARD_RE.test(c) && i < last) out.add(i);
    clauseStart = i + 1;
  }
  if (level === 'advanced') return out;

  const P = PARAMS[level];
  for (const [from, to] of clauses) {
    const words = wordsOf(chars, from, to);
    let chunkStart = from;
    for (let k = 1; k < words.length; k += 1) {
      const w = words[k];
      const prev = words[k - 1];
      const chunkLen = w.start - chunkStart;
      const remaining = to - w.start;
      if (chunkLen < P.minBefore || remaining < MIN_AFTER) continue;

      const isConj = CONJ.includes(w.text);
      const isPrep = level === 'beginner' && PREP.includes(w.text);
      const leadConj = level === 'beginner' && CONJ.includes(prev.text) && chunkLen === prev.len && remaining >= 3;
      const afterDe = prev.text === '的' && chunkLen >= P.deLen;
      // "…的 + 명사" 는 길이 때문에 갈라놓지 않는다(神的/儿子 방지). 정말 긴 경우만 afterDe가 처리.
      const tooLong = chunkLen + w.len > P.cap && prev.text !== '的';
      if (isConj || isPrep || leadConj || afterDe || tooLong) {
        out.add(w.start - 1);
        chunkStart = w.start;
      }
    }
  }
  return out;
}

/** 글자별 병음 토큰 열에 "/" 표시 토큰을 끼워 넣는다. */
export function markChunksTokens(tokens: RubyToken[], level: ChunkLevel): RubyToken[] {
  if (level === 'off') return tokens;
  const breaks = breaksForTokens(tokens, level);
  const out: RubyToken[] = [];
  tokens.forEach((t, i) => {
    out.push(t);
    if (breaks.has(i)) out.push({ ch: '/', py: '', mark: true });
  });
  return out;
}

/** 토큰 기준 끊을 자리. "…我们 ，" 처럼 부호가 바로 뒤따르면 부호 뒤로 미룬다(중복 방지). */
function breaksForTokens(tokens: RubyToken[], level: ChunkLevel): Set<number> {
  const raw = chunkBreaks(tokens.map((t) => t.ch), level);
  const out = new Set<number>();
  raw.forEach((i) => {
    const next = tokens[i + 1];
    if (!isChunkBreak(tokens[i].ch) && next && isChunkBreak(next.ch)) return;
    out.add(i);
  });
  return out;
}

/** 일반(비-루비) 표시용: 한자 문자열과 병음 문자열에 각각 "/" 를 삽입. */
export function markChunksText(
  zh: string,
  pinyin: string,
  level: ChunkLevel,
): { zh: string; pinyin: string } {
  if (level === 'off') return { zh, pinyin };
  const tokens = alignRuby(zh, pinyin);
  if (!tokens) {
    // 정렬 불가: 한자는 규칙대로, 병음은 쉼표 자리만.
    const zhChars = Array.from(zh);
    const zb = chunkBreaks(zhChars, level);
    const zhOut = zhChars.map((c, i) => (zb.has(i) ? `${c}/` : c)).join('');
    return { zh: zhOut, pinyin: markPinyinCommas(pinyin) };
  }
  const breaks = breaksForTokens(tokens, level);
  const zhOut = tokens.map((t, i) => (breaks.has(i) ? `${t.ch}/` : t.ch)).join('');

  // 병음: 끊을 토큰 직전까지 소비한 음절 수 → 해당 음절 끝(+뒤따르는 쉼표류) 뒤에 " /".
  const ends = pinyinSyllableEnds(pinyin);
  const insertAt = new Set<number>();
  let syl = 0;
  tokens.forEach((t, i) => {
    if (t.py) syl += 1;
    if (!breaks.has(i) || syl === 0 || syl > ends.length) return;
    let off = ends[syl - 1];
    while (off < pinyin.length && /[,;:]/.test(pinyin[off])) off += 1;
    if (off < pinyin.trimEnd().length) insertAt.add(off);
  });
  let pyOut = '';
  for (let k = 0; k < pinyin.length; k += 1) {
    pyOut += pinyin[k];
    if (insertAt.has(k + 1)) pyOut += ' /';
  }
  return { zh: zhOut, pinyin: pyOut };
}

function markPinyinCommas(pinyin: string): string {
  const chars = Array.from(pinyin);
  const lastIdx = pinyin.trimEnd().length - 1;
  return chars.map((c, i) => (i < lastIdx && /[,;:]/.test(c) ? `${c} /` : c)).join('');
}
