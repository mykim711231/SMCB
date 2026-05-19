/**
 * 최소 대조쌍(Minimal Pairs) 추출.
 *   - 입력: vocab 카드 풀 + (옵션) 발음표(PronRow) 풀.
 *   - 출력: 듣기 게임에 쓸 후보 페어 리스트.
 *
 * 페어 기준 (우선순위):
 *   1) 동일 무성조 pinyin, 다른 성조 — 한국 학습자 핵심 난점 (e.g., shī ↔ shí)
 *   2) 동일 자음군·동일 성조, 모음만 다름 (e.g., bā ↔ pā ... 추후)
 *
 * 단순화:
 *   - 단음절 단어만 사용 (한자 1글자, pinyin에 공백 없음).
 *     다음절은 비교 잡음이 크고 게임 의도(성조 변별)에서 벗어남.
 *
 * 발음표 항목은 SRS 카드가 없으므로 PairItem.source = 'pron'으로 표시하고,
 * Quiz.tsx onPairsResult에서 source==='pron'이면 SRS 그레이딩을 스킵한다.
 */
import type { PronRow, VocabEntry } from '@/types/lesson';

const TONE_MAP: Record<string, string> = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a',
  ē: 'e', é: 'e', ě: 'e', è: 'e',
  ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
  ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
  ǖ: 'u', ǘ: 'u', ǚ: 'u', ǜ: 'u', ü: 'u',
};

const TONE_NUM: Record<string, 1 | 2 | 3 | 4> = {
  ā: 1, ē: 1, ī: 1, ō: 1, ū: 1, ǖ: 1,
  á: 2, é: 2, í: 2, ó: 2, ú: 2, ǘ: 2,
  ǎ: 3, ě: 3, ǐ: 3, ǒ: 3, ǔ: 3, ǚ: 3,
  à: 4, è: 4, ì: 4, ò: 4, ù: 4, ǜ: 4,
};

export function stripTone(pinyin: string): string {
  return pinyin
    .toLowerCase()
    .split('')
    .map((c) => TONE_MAP[c] ?? c)
    .join('');
}

/** word/pinyin이 단음절(공백 없는 pinyin 1글자 한자)인지. */
function isMonosyllableRaw(word: string, pinyin: string): boolean {
  if (!pinyin) return false;
  if (pinyin.trim().includes(' ')) return false;
  return Array.from(word).length === 1;
}

/** pinyin에서 첫 번째 성조 마크의 번호(1~4)를 추출. 없으면 0(輕聲). */
export function toneOf(pinyin: string): 0 | 1 | 2 | 3 | 4 {
  for (const c of pinyin) {
    const n = TONE_NUM[c];
    if (n) return n;
  }
  return 0;
}

export type PairItem = {
  word: string;       // 한자
  pinyin: string;     // 성조 포함
  meaning: string;
  tone: 0 | 1 | 2 | 3 | 4;
  /**
   * SRS 매핑용 id.
   *   - source 'vocab': vocab.id (Quiz.tsx에서 `v:${vocabId}`로 변환됨)
   *   - source 'pron' : `pron:${lessonId}:${idx}` (SRS 카드 없음 — 그레이딩 스킵)
   */
  vocabId: string;
  lessonId: string;
  source: 'vocab' | 'pron';
};

export type MinimalPair = {
  key: string;         // 무성조 pinyin (그룹 식별자)
  items: PairItem[];   // 같은 무성조에 속하는 단어들 (성조만 다름)
};

/**
 * vocab + pronunciation 풀에서 동일 무성조 pinyin을 공유하는 단음절 항목을 그룹화.
 * 항목이 2개 이상인 그룹만 반환.
 *
 * pron은 옵셔널 — 호출처에서 발음표 단음절 옵션을 켤지 결정한다.
 * 동일 한자가 vocab과 pron 양쪽에 있으면 vocab 우선(SRS 카드가 있음).
 */
export function extractMinimalPairs(
  vocabs: Array<{ vocab: VocabEntry; lessonId: string }>,
  prons: Array<{ pron: PronRow; lessonId: string; idx: number }> = [],
): MinimalPair[] {
  const groups = new Map<string, PairItem[]>();
  for (const { vocab, lessonId } of vocabs) {
    if (!isMonosyllableRaw(vocab.word, vocab.pinyin)) continue;
    const key = stripTone(vocab.pinyin);
    if (!key) continue;
    const item: PairItem = {
      word: vocab.word,
      pinyin: vocab.pinyin,
      meaning: vocab.meaning,
      tone: toneOf(vocab.pinyin),
      vocabId: vocab.id,
      lessonId,
      source: 'vocab',
    };
    const list = groups.get(key);
    if (list) {
      if (!list.some((p) => p.word === item.word)) list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  for (const { pron, lessonId, idx } of prons) {
    if (!isMonosyllableRaw(pron.hanzi, pron.pinyin)) continue;
    const key = stripTone(pron.pinyin);
    if (!key) continue;
    const item: PairItem = {
      word: pron.hanzi,
      pinyin: pron.pinyin,
      meaning: pron.ko,
      tone: toneOf(pron.pinyin),
      vocabId: `pron:${lessonId}:${idx}`,
      lessonId,
      source: 'pron',
    };
    const list = groups.get(key);
    if (list) {
      // 동일 한자가 이미 들어있으면(주로 vocab) 추가 안 함 — vocab 우선
      if (!list.some((p) => p.word === item.word)) list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  const out: MinimalPair[] = [];
  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    // 성조 오름차순 정렬로 안정적 표시
    items.sort((a, b) => a.tone - b.tone);
    out.push({ key, items });
  }
  // 더 많은 변별이 가능한(=items 더 많은) 그룹을 앞으로
  out.sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
  return out;
}
