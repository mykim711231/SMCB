/**
 * 플래시카드 아이템 빌더 + ID 헬퍼.
 *
 * 카드 종류:
 *   vocab    — 단어 (VocabEntry)
 *   example  — 단어에 딸린 예문 (VocabEntry.example)
 *   verse    — 성경 구절 (BibleQuote)
 *   dialog   — 회화 라인 (dialogDaily/dialogGospel)
 *   scenario — 실전 시나리오의 verse trio
 *
 * SRS 카드 키 형식:
 *   v:{vocabId}                       (예: v:vol1_01_v1)
 *   e:{vocabId}                       (예: e:vol1_01_v1)
 *   b:{lessonId}:{idx}                (예: b:vol1_01:0)
 *   d:{lessonId}:{dd|dg}:{di}:{li}    (예: d:vol1_01:dd:0:1)
 *   s:{lessonId}:{i}:{j}              (예: s:vol1_01:0:3)
 *
 * 즐겨찾기 키(favKey)도 함께 노출하여 Flashcards에서 일관되게 사용.
 */
import type { BibleQuote, Lesson, Verse, VocabEntry } from '@/types/lesson';
import { favKey } from '@/stores/favorites';

export type DialogKind = 'dd' | 'dg';

export type CardSource =
  | { kind: 'vocab'; vocab: VocabEntry; lessonId: string; lessonTitleKo: string }
  | { kind: 'example'; vocab: VocabEntry; lessonId: string; lessonTitleKo: string }
  | { kind: 'verse'; verse: BibleQuote; lessonId: string; lessonTitleKo: string; idx: number }
  | {
      kind: 'dialog';
      verse: Verse;
      dialogKind: DialogKind;
      dialogIdx: number;
      lineIdx: number;
      role?: string;
      lessonId: string;
      lessonTitleKo: string;
    }
  | {
      kind: 'scenario';
      verse: Verse;
      scenarioIdx: number;
      segmentIdx: number;
      title: string;
      lessonId: string;
      lessonTitleKo: string;
    }
  // 본문 — 마라톤 모드에서만 사용 (플래시카드/Quiz 풀에는 미포함)
  | { kind: 'body'; verse: Verse; idx: number; lessonId: string; lessonTitleKo: string };

export function cardIdOf(s: CardSource): string {
  if (s.kind === 'vocab') return `v:${s.vocab.id}`;
  if (s.kind === 'example') return `e:${s.vocab.id}`;
  if (s.kind === 'verse') return `b:${s.lessonId}:${s.idx}`;
  if (s.kind === 'dialog') return `d:${s.lessonId}:${s.dialogKind}:${s.dialogIdx}:${s.lineIdx}`;
  if (s.kind === 'scenario') return `s:${s.lessonId}:${s.scenarioIdx}:${s.segmentIdx}`;
  return `t:${s.lessonId}:${s.idx}`;
}

export function favKeyOf(s: CardSource): string {
  if (s.kind === 'vocab') return favKey(s.lessonId, 'vocab', s.vocab.id);
  if (s.kind === 'example') return favKey(s.lessonId, 'vocabExample', s.vocab.id);
  if (s.kind === 'verse') return favKey(s.lessonId, 'bible', s.idx);
  if (s.kind === 'dialog') {
    const k = s.dialogKind === 'dd' ? 'dialogDaily' : 'dialogGospel';
    return favKey(s.lessonId, k, `${s.dialogIdx}:${s.lineIdx}`);
  }
  if (s.kind === 'scenario') return favKey(s.lessonId, 'scenario', `${s.scenarioIdx}:${s.segmentIdx}`);
  return favKey(s.lessonId, 'body', s.idx);
}

/**
 * @param appendixVocabs 부록(주로 부록1)에서 추출한 학습 vocab. lessonId 자리에
 *   Appendix.id("appendix1")가 들어가며 lessonTitleKo는 부록 제목을 보여준다.
 *   - example 카드는 없음 (부록 표에는 예문 컬럼이 없음)
 *   - CardView에서 lessonId가 "appendix"로 시작하면 /appendix/{id} 로 라우팅 필요
 */
export function buildAllCardSources(
  lessons: Lesson[],
  appendixVocabs: Array<{ vocab: VocabEntry; lessonId: string; lessonTitleKo: string }> = [],
): CardSource[] {
  const out: CardSource[] = [];
  for (const av of appendixVocabs) {
    out.push({ kind: 'vocab', vocab: av.vocab, lessonId: av.lessonId, lessonTitleKo: av.lessonTitleKo });
  }
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
    l.dialogDaily.forEach((d, di) =>
      d.lines.forEach((v, li) =>
        out.push({
          kind: 'dialog',
          verse: v,
          dialogKind: 'dd',
          dialogIdx: di,
          lineIdx: li,
          role: d.role,
          lessonId: l.id,
          lessonTitleKo: l.titleKo,
        }),
      ),
    );
    l.dialogGospel.forEach((d, di) =>
      d.lines.forEach((v, li) =>
        out.push({
          kind: 'dialog',
          verse: v,
          dialogKind: 'dg',
          dialogIdx: di,
          lineIdx: li,
          role: d.role,
          lessonId: l.id,
          lessonTitleKo: l.titleKo,
        }),
      ),
    );
    l.scenarios.forEach((sc, si) =>
      sc.segments.forEach((seg, sj) => {
        if (seg.kind !== 'verse') return;
        out.push({
          kind: 'scenario',
          verse: seg.verse,
          scenarioIdx: si,
          segmentIdx: sj,
          title: sc.title,
          lessonId: l.id,
          lessonTitleKo: l.titleKo,
        });
      }),
    );
  }
  return out;
}

/**
 * 마라톤 전용 카드 빌더.
 *   - 권/과 순서를 유지하며, 한 과 안에서는 본문 → 단어 → 예문 → 구절 → 회화(일상→복음) → 시나리오 순으로 직렬화.
 *   - 영역 토글로 일부 영역만 선택 가능.
 *   - 부록은 마라톤에서 제외 (별도 학습 흐름).
 */
export type MarathonAreas = {
  body: boolean;
  vocab: boolean;
  example: boolean;
  bible: boolean;
  dialog: boolean;
  scenario: boolean;
};

export function buildMarathonSources(lessons: Lesson[], areas: MarathonAreas): CardSource[] {
  const out: CardSource[] = [];
  for (const l of lessons) {
    if (areas.body) {
      l.body.forEach((v, idx) =>
        out.push({ kind: 'body', verse: v, idx, lessonId: l.id, lessonTitleKo: l.titleKo }),
      );
    }
    if (areas.vocab || areas.example) {
      for (const v of l.vocab) {
        if (areas.vocab) {
          out.push({ kind: 'vocab', vocab: v, lessonId: l.id, lessonTitleKo: l.titleKo });
        }
        if (areas.example && v.example) {
          out.push({ kind: 'example', vocab: v, lessonId: l.id, lessonTitleKo: l.titleKo });
        }
      }
    }
    if (areas.bible) {
      l.bible.forEach((b, idx) =>
        out.push({ kind: 'verse', verse: b, lessonId: l.id, lessonTitleKo: l.titleKo, idx }),
      );
    }
    if (areas.dialog) {
      l.dialogDaily.forEach((d, di) =>
        d.lines.forEach((v, li) =>
          out.push({
            kind: 'dialog', verse: v, dialogKind: 'dd', dialogIdx: di, lineIdx: li,
            role: d.role, lessonId: l.id, lessonTitleKo: l.titleKo,
          }),
        ),
      );
      l.dialogGospel.forEach((d, di) =>
        d.lines.forEach((v, li) =>
          out.push({
            kind: 'dialog', verse: v, dialogKind: 'dg', dialogIdx: di, lineIdx: li,
            role: d.role, lessonId: l.id, lessonTitleKo: l.titleKo,
          }),
        ),
      );
    }
    if (areas.scenario) {
      l.scenarios.forEach((sc, si) =>
        sc.segments.forEach((seg, sj) => {
          if (seg.kind !== 'verse') return;
          out.push({
            kind: 'scenario', verse: seg.verse, scenarioIdx: si, segmentIdx: sj,
            title: sc.title, lessonId: l.id, lessonTitleKo: l.titleKo,
          });
        }),
      );
    }
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
  if (s.kind === 'dialog' || s.kind === 'scenario' || s.kind === 'body') {
    return direction === 'zh2ko' ? s.verse.zh : s.verse.ko;
  }
  return '';
}

/** TTS로 발음 학습용으로 읽어야 하는 중국어 텍스트. (방향과 무관하게 zh를 읽음) */
export function speakTextOf(s: CardSource): string {
  if (s.kind === 'vocab') return s.vocab.word;
  if (s.kind === 'example' && s.vocab.example) return s.vocab.example.zh;
  if (s.kind === 'verse') return s.verse.text.zh;
  if (s.kind === 'dialog' || s.kind === 'scenario' || s.kind === 'body') return s.verse.zh;
  return '';
}
