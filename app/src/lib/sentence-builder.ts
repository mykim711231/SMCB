/**
 * 문장 조립 퀴즈 라이브러리.
 *
 * 입력 소스:
 *   - 회화(dialogDaily, dialogGospel)의 lines — 모두 북경 표준어, 선교 목적의 전도 회화 포함
 *   - 단어 예문(vocab.example)
 *   - 실전 시나리오(scenarios)의 verse 세그먼트 — 실제 전도 상황에서 사용되는 인용 문장
 *   - 어법 예문(grammar.examples) — 패턴 학습 후 변형 출력
 *   - 본문 질문(questions) — 본문 이해 확인용 회화체 질문
 *
 * 제외 대상:
 *   - 본문(lesson.body), 성경 인용(lesson.bible) — 문어체·고전 표현이라 회화 조립 학습 가치 ↓
 *
 * 토큰화 전략:
 *   - 중국어 문장은 공백이 없어 split 불가 → Intl.Segmenter('zh', {granularity: 'word'}) 사용.
 *     모든 모던 브라우저(Chrome 87+, Firefox 125+, Safari 14.1+) Baseline.
 *   - Segmenter 미지원 환경 또는 위험한 케이스(전체가 1토큰)는 한 글자 분할로 fallback.
 *   - 구두점(중/영문)은 별도 토큰으로 분리 (사용자가 굳이 끼우지 않아도 채점이 너그럽도록 정답 정규화에서 제거).
 *
 * 채점:
 *   - 사용자가 만든 토큰 시퀀스의 join("")을 정답 join("")과 비교.
 *   - 양쪽 모두 구두점/공백/한글병기 제거 후 비교.
 *
 * 프롬프트 ID 형식 (Quiz.tsx srsCardIdFromPrompt 와 동기화 필수):
 *   프롬프트 ID 는 인덱스 기반이지만, SRS 카드 키는 콘텐츠 해시(v3)다.
 *   Quiz.tsx srsCardIdFromPrompt 가 프롬프트의 zh/ko 본문에서 키를 산출한다.
 *   - `{lessonId}:dd:{di}:{li}` — 응용 회화         → SRS `d:{lessonId}:dd:h{hash}`
 *   - `{lessonId}:dg:{di}:{li}` — 전도 회화         → SRS `d:{lessonId}:dg:h{hash}`
 *   - `{lessonId}:ex:{vocabId}` — 단어 예문         → SRS `v:{vocabId}`
 *   - `{lessonId}:sc:{si}:{sj}` — 실전 시나리오     → SRS `s:{lessonId}:h{hash}`
 *   - `{lessonId}:ge:{gi}:{ei}` — 어법 예문         → SRS 카드 없음 (전체 덱 한정)
 *   - `{lessonId}:q:{qi}`       — 본문 질문         → SRS 카드 없음 (전체 덱 한정)
 */
import type { Lesson, Verse } from '@/types/lesson';
import {
  normalizeForCompare as _normalizeForCompare,
  tokenizeChinese as _tokenizeChinese,
  setTokenManifest,
} from '@/lib/zh-tokenize';
import tokenManifest from '@/data/zh-tokens.json';

// 빌드타임 사전계산 토큰 매니페스트 주입 — 모듈 로드 시 1회.
// 매니페스트는 build-content.ts가 생성하며, 브라우저 ICU 버전 차이로 인한 토큰화
// 불안정을 회피한다.
setTokenManifest(tokenManifest as Record<string, string[]>);

export type SentencePrompt = {
  id: string;             // 안정 ID (lessonId + 종류 + 인덱스)
  lessonId: string;
  lessonTitleKo: string;
  source: 'dialog' | 'example' | 'verse' | 'scenario' | 'grammarExample' | 'question';
  ko: string;             // 한국어 단서
  zh: string;             // 정답 중국어 원문
  pinyin: string;         // 정답 병음 (reveal/도움말용)
  speakers?: string;      // 회화일 때 화자 (옵션)
};

// 호환성 re-export — 기존 호출처(McqGame 등)는 sentence-builder에서 import 중.
// 실제 구현은 @/lib/zh-tokenize. 빌드타임 사전계산 매니페스트는 이 모듈 로드 시 주입(상단 setTokenManifest).
export const normalizeForCompare = _normalizeForCompare;
export const tokenizeChinese = _tokenizeChinese;

/**
 * 거짓 토큰을 다른 후보 문장에서 추출하여 섞기.
 * 정답에 이미 포함된 토큰은 제외.
 */
export function makeDistractorTokens(
  answer: string[],
  otherSentences: string[],
  count: number,
  seed: number,
): string[] {
  const have = new Set(answer);
  const pool = new Set<string>();
  for (const s of otherSentences) {
    for (const t of tokenizeChinese(s)) {
      if (!have.has(t)) pool.add(t);
    }
  }
  const list = Array.from(pool);
  // seed 기반 셔플
  let s = seed || 1;
  for (let i = list.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, Math.max(0, count));
}

export function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function seedFromString(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pushVerseIf(out: SentencePrompt[], v: Verse, base: Omit<SentencePrompt, 'ko' | 'zh' | 'pinyin'>): void {
  if (!v?.ko || !v?.zh) return;
  // 너무 짧은(1자) 정답·너무 긴(>40자) 정답은 게임으로 부적합
  const tokens = tokenizeChinese(v.zh);
  if (tokens.length < 2 || tokens.length > 14) return;
  out.push({ ...base, ko: v.ko, zh: v.zh, pinyin: v.pinyin ?? '' });
}

/**
 * 한 레슨에서 회화·예문을 평탄화하여 SentencePrompt[]로.
 * dialogDaily(일상 회화) + dialogGospel(전도 회화, 선교 목적) + vocab.example을 포함.
 * body(본문)·bible(성경 인용)은 문어체라 제외.
 */
export function buildPromptsFromLesson(l: Lesson): SentencePrompt[] {
  const out: SentencePrompt[] = [];
  const meta = { lessonId: l.id, lessonTitleKo: l.titleKo };

  l.dialogDaily?.forEach((d, di) => {
    d.lines.forEach((line, li) => {
      pushVerseIf(out, line, {
        id: `${l.id}:dd:${di}:${li}`,
        source: 'dialog',
        speakers: d.role,
        ...meta,
      });
    });
  });
  l.dialogGospel?.forEach((d, di) => {
    d.lines.forEach((line, li) => {
      pushVerseIf(out, line, {
        id: `${l.id}:dg:${di}:${li}`,
        source: 'dialog',
        speakers: d.role,
        ...meta,
      });
    });
  });
  l.vocab?.forEach((v) => {
    if (!v.example) return;
    pushVerseIf(out, v.example, {
      id: `${l.id}:ex:${v.id}`,
      source: 'example',
      ...meta,
    });
  });
  // 실전 시나리오: kind='verse' 세그먼트의 zh/ko/pinyin 트리오를 그대로 출제.
  // 시나리오 제목은 화자/맥락 단서로 speakers에 노출.
  l.scenarios?.forEach((sc, si) => {
    sc.segments.forEach((seg, sj) => {
      if (seg.kind !== 'verse') return;
      pushVerseIf(out, seg.verse, {
        id: `${l.id}:sc:${si}:${sj}`,
        source: 'scenario',
        speakers: sc.title,
        ...meta,
      });
    });
  });
  // 어법 예문: 패턴 학습 직후 토큰 조합으로 산출 연습.
  // SRS 카드는 없음(전체 덱 한정) — Quiz.tsx srsCardIdFromPromptId가 null 반환.
  l.grammar?.forEach((g, gi) => {
    g.examples?.forEach((e, ei) => {
      pushVerseIf(out, e, {
        id: `${l.id}:ge:${gi}:${ei}`,
        source: 'grammarExample',
        speakers: g.pattern,
        ...meta,
      });
    });
  });
  // 본문 질문: 본문 이해 확인용 회화체 질문. SRS 카드 없음(전체 덱 한정).
  l.questions?.forEach((q, qi) => {
    pushVerseIf(out, { ko: q.ko, zh: q.zh, pinyin: q.pinyin }, {
      id: `${l.id}:q:${qi}`,
      source: 'question',
      ...meta,
    });
  });

  return out;
}

export function buildAllPrompts(lessons: Lesson[]): SentencePrompt[] {
  const out: SentencePrompt[] = [];
  for (const l of lessons) out.push(...buildPromptsFromLesson(l));
  return out;
}

export type GradeResult = {
  correct: boolean;
  expectedJoined: string;     // 비교에 사용된 정규화 정답
  actualJoined: string;       // 비교에 사용된 정규화 입력
};

export function gradeAnswer(answerTokens: string[], userTokens: string[]): GradeResult {
  const expected = normalizeForCompare(answerTokens.join(''));
  const actual = normalizeForCompare(userTokens.join(''));
  return { correct: expected === actual, expectedJoined: expected, actualJoined: actual };
}
