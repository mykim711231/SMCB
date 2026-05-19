/**
 * 플래시카드 아이템 빌더 + ID 헬퍼.
 *
 * 카드 종류:
 *   vocab   — 단어 (VocabEntry)
 *   example — 단어에 딸린 예문 (VocabEntry.example)
 *   verse   — 성경 구절 (BibleQuote)
 *
 * SRS 카드 키 형식:
 *   v:{vocabId}            (예: v:vol1_01_v1)
 *   e:{vocabId}            (예: e:vol1_01_v1)
 *   b:{lessonId}:{idx}     (예: b:vol1_01:0)
 *
 * 즐겨찾기 키(favKey)도 함께 노출하여 Flashcards에서 일관되게 사용.
 */
import type { BibleQuote, Lesson, VocabEntry } from '@/types/lesson';
import { favKey } from '@/stores/favorites';

export type CardSource =
  | { kind: 'vocab'; vocab: VocabEntry; lessonId: string; lessonTitleKo: string }
  | { kind: 'example'; vocab: VocabEntry; lessonId: string; lessonTitleKo: string }
  | { kind: 'verse'; verse: BibleQuote; lessonId: string; lessonTitleKo: string; idx: number };

export function cardIdOf(s: CardSource): string {
  if (s.kind === 'vocab') return `v:${s.vocab.id}`;
  if (s.kind === 'example') return `e:${s.vocab.id}`;
  return `b:${s.lessonId}:${s.idx}`;
}

export function favKeyOf(s: CardSource): string {
  if (s.kind === 'vocab' || s.kind === 'example') {
    return favKey(s.lessonId, 'vocab', s.vocab.id);
  }
  return favKey(s.lessonId, 'bible', s.idx);
}

export function buildAllCardSources(lessons: Lesson[]): CardSource[] {
  const out: CardSource[] = [];
  for (const l of lessons) {
    for (const v of l.vocab) {
      out.push({ kind: 'vocab', vocab: v, lessonId: l.id, lessonTitleKo: l.titleKo });
      if (v.example) {
        out.push({ kind: 'example', vocab: v, lessonId: l.id, lessonTitleKo: l.titleKo });
      }
    }
    l.bible.forEach((b, idx) => {
      out.push({ kind: 'verse', verse: b, lessonId: l.id, lessonTitleKo: l.titleKo, idx });
    });
  }
  return out;
}

/** 카드의 "보여줄 텍스트"를 방향과 종류에 맞춰 추출. */
export function frontText(s: CardSource, direction: 'zh2ko' | 'ko2zh'): string {
  if (s.kind === 'vocab') return direction === 'zh2ko' ? s.vocab.word : s.vocab.meaning;
  if (s.kind === 'example' && s.vocab.example) {
    return direction === 'zh2ko' ? s.vocab.example.zh : s.vocab.example.ko;
  }
  if (s.kind === 'verse') return direction === 'zh2ko' ? s.verse.text.zh : s.verse.text.ko;
  return '';
}

/** TTS로 발음 학습용으로 읽어야 하는 중국어 텍스트. (방향과 무관하게 zh를 읽음) */
export function speakTextOf(s: CardSource): string {
  if (s.kind === 'vocab') return s.vocab.word;
  if (s.kind === 'example' && s.vocab.example) return s.vocab.example.zh;
  if (s.kind === 'verse') return s.verse.text.zh;
  return '';
}
