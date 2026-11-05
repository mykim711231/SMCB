/**
 * 끊어 읽기 표시 — 분석 단위(단어 → 구 → 절)별로 문장을 나눠 보여 준다.
 *
 * 표시는 모든 단계에서 "|" 하나로 통일하고, 단계마다 나누는 단위만 다르다.
 *   - word   단어(词): 我 | 有 | 两个 | 弟弟
 *   - phrase 구(短语): 我 | 有 | 两个弟弟
 *   - clause 절(小句): 쉼표·모점 뒤에만 표시.
 *
 * 단어·구 경계는 jieba 형태소 분석으로 미리 계산한 `src/data/zh-chunks.json`
 * (scripts/build-chunks.py)을 쓴다. 데이터에 없는 문장은 Intl.Segmenter 단어 분절로
 * 폴백하고, 구 단위는 절 표시만 한다. 원문(zh/pinyin)과 TTS는 건드리지 않는다.
 */
import { tokenizeChinese } from '@/lib/zh-tokenize';
import { alignRuby, pinyinSyllableEnds, type RubyToken } from '@/lib/pinyinRuby';

export type ChunkLevel = 'off' | 'word' | 'phrase' | 'clause';
export type ChunkMark = 'gap' | 'phrase' | 'clause';

export const CHUNK_LEVELS: ChunkLevel[] = ['off', 'word', 'phrase', 'clause'];

/** 절 표시 대상: 전각 쉼표·모점·세미콜론·콜론 + 병음용 ASCII. */
const HARD_RE = /[，、；：,;:]/;
const CONTENT_RE = /[一-鿿0-9A-Za-z]/;

export function isChunkBreak(ch: string): boolean {
  return HARD_RE.test(ch);
}

/** 저장된 값(옛 초급/중급/고급, boolean 포함)을 새 단계로 정규화. */
export function normalizeChunkLevel(v: unknown): ChunkLevel {
  if (v === 'off' || v === 'word' || v === 'phrase' || v === 'clause') return v;
  if (v === 'beginner') return 'word';
  if (v === 'intermediate') return 'phrase';
  if (v === 'advanced' || v === true) return 'clause';
  return 'off';
}

// ── 사전계산 데이터 ────────────────────────────────────────────────

let chunkData: Map<string, string> | null = null;
let loading: Promise<void> | null = null;

/** 단어/구 데이터를 지연 로드한다(첫 사용 때만). */
export function loadChunkData(): Promise<void> {
  if (chunkData) return Promise.resolve();
  if (!loading) {
    loading = import('@/data/zh-chunks.json')
      .then((m) => {
        const list = (m.default ?? m) as unknown as string[];
        const map = new Map<string, string>();
        for (const s of list) map.set(s.replace(/[|/\s]/g, ''), s);
        chunkData = map;
      })
      .catch(() => {
        chunkData = new Map();
      });
  }
  return loading;
}

export function isChunkDataLoaded(): boolean {
  return chunkData !== null;
}

/** "神|爱/世人" → { 0:'gap', 1:'phrase' } (표시가 붙은 글자 인덱스). */
function parseMarked(marked: string): Map<number, 'gap' | 'phrase'> {
  const out = new Map<number, 'gap' | 'phrase'>();
  let idx = -1;
  for (const c of Array.from(marked)) {
    if (c === '|') out.set(idx, 'gap');
    else if (c === '/') out.set(idx, 'phrase');
    else if (!/\s/.test(c)) idx += 1;
  }
  return out;
}

// ── 표시 위치 계산 ─────────────────────────────────────────────────

/** 글자 i 뒤에 붙일 표시. 문장 끝 부호 뒤에는 표시하지 않는다. */
export function chunkMarkMap(chars: string[], level: ChunkLevel): Map<number, ChunkMark> {
  const out = new Map<number, ChunkMark>();
  if (level === 'off') return out;

  let last = chars.length - 1;
  while (last >= 0 && /\s/.test(chars[last])) last -= 1;

  // 절 표시 — 모든 단계 공통
  for (let i = 0; i < last; i += 1) {
    if (HARD_RE.test(chars[i])) out.set(i, 'clause');
  }
  if (level === 'clause') return out;

  // 단어/구 경계
  let bounds: Map<number, 'gap' | 'phrase'> | null = null;
  // 공백은 키·위치 계산에서 제외(alignRuby가 공백을 건너뛰므로 양쪽 일치)
  const compact: number[] = [];
  chars.forEach((c, i) => { if (!/\s/.test(c)) compact.push(i); });
  const key = compact.map((i) => chars[i]).join('');
  const marked = chunkData?.get(key);
  if (marked) {
    bounds = new Map();
    parseMarked(marked).forEach((kind, j) => {
      if (j >= 0 && j < compact.length) bounds!.set(compact[j], kind);
    });
  } else if (level === 'word') {
    bounds = new Map();
    const tokens = tokenizeChinese(chars.join(''));
    if (tokens.join('') === chars.join('')) {
      let o = -1;
      for (const t of tokens) {
        o += Array.from(t).length;
        bounds.set(o, 'gap');
      }
    }
  }
  if (!bounds) return out;

  bounds.forEach((kind, i) => {
    if (i >= last || out.has(i)) return;
    if (!CONTENT_RE.test(chars[i]) || !CONTENT_RE.test(chars[i + 1])) return;
    if (level === 'phrase' && kind !== 'phrase') return;
    out.set(i, level === 'word' ? 'gap' : 'phrase');
  });
  return out;
}

/** 글자별 병음 토큰 열에 표시 토큰을 끼워 넣는다. */
export function markChunksTokens(tokens: RubyToken[], level: ChunkLevel): RubyToken[] {
  if (level === 'off') return tokens;
  const marks = chunkMarkMap(tokens.map((t) => t.ch), level);
  if (marks.size === 0) return tokens;
  const out: RubyToken[] = [];
  tokens.forEach((t, i) => {
    out.push(t);
    const m = marks.get(i);
    if (m) out.push({ ch: '|', py: '', mark: m });
  });
  return out;
}

const FULLWIDTH = /[，、；：。！？]/;

/** 일반(비-루비) 표시용: 한자 문자열과 병음 문자열에 각각 표시를 삽입. */
export function markChunksText(
  zh: string,
  pinyin: string,
  level: ChunkLevel,
): { zh: string; pinyin: string } {
  if (level === 'off') return { zh, pinyin };
  const tokens = alignRuby(zh, pinyin);
  if (!tokens) {
    // 정렬 불가: 한자는 그대로 규칙 적용, 병음은 쉼표 자리만.
    const chars = Array.from(zh);
    const marks = chunkMarkMap(chars, level);
    return { zh: joinZh(chars, marks), pinyin: markPinyinCommas(pinyin) };
  }
  const chars = tokens.map((t) => t.ch);
  const marks = chunkMarkMap(chars, level);
  const zhOut = joinZh(chars, marks);

  // 병음: 표시할 토큰까지 소비한 음절 수 → 해당 음절 끝(+뒤따르는 쉼표류) 뒤에 " /".
  const ends = pinyinSyllableEnds(pinyin);
  const insertAt = new Map<number, string>();
  let syl = 0;
  tokens.forEach((t, i) => {
    if (t.py) syl += 1;
    const m = marks.get(i);
    if (!m || syl === 0 || syl > ends.length) return;
    let off = ends[syl - 1];
    while (off < pinyin.length && /[,;:]/.test(pinyin[off])) off += 1;
    if (off < pinyin.trimEnd().length) insertAt.set(off, ' |');
  });
  let pyOut = '';
  for (let k = 0; k < pinyin.length; k += 1) {
    pyOut += pinyin[k];
    const ins = insertAt.get(k + 1);
    if (ins) pyOut += ins;
  }
  return { zh: zhOut, pinyin: pyOut };
}

function joinZh(chars: string[], marks: Map<number, ChunkMark>): string {
  return chars
    .map((c, i) => {
      const m = marks.get(i);
      if (!m) return c;
      return FULLWIDTH.test(c) ? `${c}|` : `${c} |`;
    })
    .join('');
}

function markPinyinCommas(pinyin: string): string {
  const chars = Array.from(pinyin);
  const lastIdx = pinyin.trimEnd().length - 1;
  return chars.map((c, i) => (i < lastIdx && /[,;:]/.test(c) ? `${c} |` : c)).join('');
}
