/**
 * 퀴즈 페이지 (Learn 통합): 미니 게임 모음.
 *   - 문장 조립: 한국어 단서를 보고 중국어 토큰을 순서대로 탭하여 정답 만들기
 *   - 4지선다: 단어/뜻을 보고 보기 중 정답 고르기
 *   - 최소 대조쌍: 발음을 듣고 같은 무성조 후보 중 정답 고르기
 *
 * mode는 외부(Learn 페이지)에서 prop으로 주입. 페이지 내 h1·모드 탭은 제거됨.
 * 레슨 범위 필터(권별 멀티 선택)는 Flashcards와 동일한 UX 패턴.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { loadAllLessons, loadAppendixVocabs, META } from '@/data/loaders';
import type { Lesson, PronRow, VocabEntry } from '@/types/lesson';
import { useSettings } from '@/stores/settings';
import { useSRS } from '@/stores/srs';
import { useLearnScope } from '@/stores/learnScope';
import MinimalPairsGame from '@/components/flashcards/MinimalPairsGame';
import SentenceBuilderGame from '@/components/quiz/SentenceBuilderGame';
import McqGame, { type McqPrompt, type Direction } from '@/components/quiz/McqGame';
import {
  buildAllPrompts, shuffleSeeded, seedFromString, type SentencePrompt,
} from '@/lib/sentence-builder';
import { extractMinimalPairs, type MinimalPair } from '@/lib/minimal-pairs';
import { pickMistakeCards } from '@/lib/srs-stats';
import { estimateGrade } from '@/lib/quiz-grade';
import { cn } from '@/lib/cn';

export type QuizMode = 'sentence' | 'mcq' | 'pairs';

type Props = { mode: QuizMode };

/** Flashcards와 동일한 덱 모델 — 즐겨찾기(★)는 퀴즈에는 의미가 없어 제외. */
type Deck = 'due' | 'mistakes' | 'lapses' | 'all';

/**
 * SentenceBuilder 프롬프트 id → SRS 카드 id 매핑.
 *
 * sentence-builder.ts §프롬프트 ID 형식과 동기화 필수.
 *   `{lessonId}:dd:{di}:{li}` → `d:{lessonId}:dd:{di}:{li}`  (응용 회화)
 *   `{lessonId}:dg:{di}:{li}` → `d:{lessonId}:dg:{di}:{li}`  (전도 회화)
 *   `{lessonId}:ex:{vocabId}` → `v:{vocabId}`                (단어 예문)
 *   `{lessonId}:sc:{si}:{sj}` → `s:{lessonId}:{si}:{sj}`     (실전 시나리오)
 *   `{lessonId}:ge:...` / `:q:...` → null (SRS 카드 없음 → due/mistakes 덱 제외)
 */
function srsCardIdFromPromptId(promptId: string): string | null {
  const parts = promptId.split(':');
  if (parts.length < 3) return null;
  const lessonId = parts[0];
  const kind = parts[1];
  if (kind === 'dd' || kind === 'dg') {
    if (parts.length < 4) return null;
    return `d:${lessonId}:${kind}:${parts[2]}:${parts[3]}`;
  }
  if (kind === 'sc') {
    if (parts.length < 4) return null;
    return `s:${lessonId}:${parts[2]}:${parts[3]}`;
  }
  if (kind === 'ex') {
    const v = parts.slice(2).join(':');
    return v ? `v:${v}` : null;
  }
  return null;
}

export default function Quiz({ mode }: Props): JSX.Element {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  // 부록1 기독교 용어집의 학습 vocab — 설정 토글 시 4지선다·대조쌍 풀에 합쳐진다.
  // lessonId는 Appendix.id("appendix1")이며 lessonSel 멀티 필터의 범위 밖에 있으므로
  // 사용자가 토글로 켰을 때 lessonSel 선택과 무관하게 항상 포함된다.
  const [appendixVocabs, setAppendixVocabs] = useState<
    Array<{ vocab: VocabEntry; lessonId: string; lessonTitleKo: string }>
  >([]);
  // Flashcards와 공유 — 모드 전환에도 범위 유지
  const lessonSel = useLearnScope((s) => s.lessonSel);
  const setLessonSel = useLearnScope((s) => s.setLessonSel);
  const [playing, setPlaying] = useState(false);
  const [mcqDir, setMcqDir] = useState<Direction>('zh2ko');

  // 덱 상태 (Flashcards 패턴 차용) — 즐겨찾기 제외 4개
  const [deck, setDeck] = useState<Deck>('due');
  const [inLapses, setInLapses] = useState(false);
  const [lapsesSentence, setLapsesSentence] = useState<SentencePrompt[]>([]);
  const [lapsesMcq, setLapsesMcq] = useState<McqPrompt[]>([]);
  const [lapsesPairs, setLapsesPairs] = useState<MinimalPair[]>([]);

  const ttsRate = useSettings((s) => s.ttsRate);
  const ttsVoiceURI = useSettings((s) => s.ttsVoiceURI);
  const fcAlgorithm = useSettings((s) => s.fcAlgorithm);
  const fcPronInPairs = useSettings((s) => s.fcPronInPairs);
  const fcAppendixVocab = useSettings((s) => s.fcAppendixVocab);
  const grade = useSRS((s) => s.grade);
  const ensure = useSRS((s) => s.ensure);
  const cards = useSRS((s) => s.cards);

  useEffect(() => {
    let alive = true;
    void loadAllLessons().then((ls) => { if (alive) setLessons(ls); });
    return () => { alive = false; };
  }, []);

  // 부록 vocab은 토글이 켜진 동안만 로드 (대부분의 사용자에게 기본 비활성)
  useEffect(() => {
    if (!fcAppendixVocab) {
      setAppendixVocabs([]);
      return;
    }
    let alive = true;
    void loadAppendixVocabs().then((v) => { if (alive) setAppendixVocabs(v); });
    return () => { alive = false; };
  }, [fcAppendixVocab]);

  // 권별 그룹 (Flashcards와 동일 패턴)
  const lessonGroups = useMemo(() => {
    const byVol: Record<1 | 2 | 3, Array<{ id: string; no: number; label: string }>> = { 1: [], 2: [], 3: [] };
    for (const m of META) {
      byVol[m.vol].push({ id: m.id, no: m.no, label: `${String(m.no).padStart(2, '0')}과. ${m.titleKo}` });
    }
    for (const k of [1, 2, 3] as const) byVol[k].sort((a, b) => a.no - b.no);
    return byVol;
  }, []);

  const selectedLessons = useMemo(
    () => (lessonSel.size === 0 ? lessons : lessons.filter((l) => lessonSel.has(l.id))),
    [lessons, lessonSel],
  );

  // 문장 조립용 prompts (셔플하여 매 세션 다른 순서)
  // 슬라이스 없음 — 사용자가 선택한 범위의 모든 문제를 출제 (범위 선택에 따라 총 문제수가 변함)
  const prompts = useMemo(() => {
    const list = buildAllPrompts(selectedLessons);
    const seed = seedFromString(`q:${Array.from(lessonSel).sort().join(',')}`);
    return shuffleSeeded(list, seed);
  }, [selectedLessons, lessonSel]);

  // 대조쌍용 pairs — fcPronInPairs 설정 시 발음표 단음절(PronRow)도 풀에 합친다.
  // pron 항목은 SRS 카드가 없어 정답·오답 시 SRS 갱신을 스킵한다(onPairsResult 분기).
  // 부록 vocab(fcAppendixVocab)도 lessonSel과 무관하게 항상 풀에 포함된다 — v: 카드로 SRS 갱신 정상.
  const pairs = useMemo(() => {
    const vs: Array<{ vocab: VocabEntry; lessonId: string }> = [];
    const ps: Array<{ pron: PronRow; lessonId: string; idx: number }> = [];
    for (const l of selectedLessons) {
      for (const v of l.vocab) vs.push({ vocab: v, lessonId: l.id });
      if (fcPronInPairs) {
        l.pronunciation.forEach((p, i) => ps.push({ pron: p, lessonId: l.id, idx: i }));
      }
    }
    for (const av of appendixVocabs) vs.push({ vocab: av.vocab, lessonId: av.lessonId });
    return extractMinimalPairs(vs, ps);
  }, [selectedLessons, fcPronInPairs, appendixVocabs]);

  // 4지선다용 prompts (vocab 전용, 선택 범위 기반 시드 셔플)
  // 부록 vocab은 lessonSel과 무관하게 항상 포함 — distractor 풀도 함께 늘어 보기 다양성↑.
  const mcqPrompts = useMemo<McqPrompt[]>(() => {
    const out: McqPrompt[] = [];
    for (const l of selectedLessons) {
      for (const v of l.vocab) out.push({ vocab: v, lessonId: l.id, lessonTitleKo: l.titleKo });
    }
    for (const av of appendixVocabs) {
      out.push({ vocab: av.vocab, lessonId: av.lessonId, lessonTitleKo: av.lessonTitleKo });
    }
    const seed = seedFromString(`mcq:${Array.from(lessonSel).sort().join(',')}:app=${appendixVocabs.length}`);
    return shuffleSeeded(out, seed);
  }, [selectedLessons, lessonSel, appendixVocabs]);

  // 오답노트 카드 ID 셋 (Flashcards와 동일 헬퍼)
  const mistakeIds = useMemo(
    () => new Set(pickMistakeCards(cards).map((c) => c.id)),
    [cards],
  );

  // 덱 필터 helper — 'due' / 'mistakes'에서 vocab card id로 판별
  const isDueId = (id: string): boolean => {
    const c = cards[id];
    return !c || new Date(c.due).getTime() <= Date.now();
  };

  // 모드별 덱 필터 적용 — 회화/시나리오/예문은 모두 고유 SRS 카드(d:/s:/v:)로 매핑되므로
  // due·mistakes 덱에서도 정상 출제. grammarExample·question은 SRS 카드가 없어 'all' 전용.
  const filteredSentencePrompts = useMemo<SentencePrompt[]>(() => {
    if (inLapses) return lapsesSentence;
    if (deck === 'all') return prompts;
    if (deck === 'lapses') return lapsesSentence;
    return prompts.filter((p) => {
      const id = srsCardIdFromPromptId(p.id);
      if (!id) return false;
      return deck === 'due' ? isDueId(id) : mistakeIds.has(id);
    });
  }, [inLapses, lapsesSentence, deck, prompts, cards, mistakeIds]);

  const filteredMcqPrompts = useMemo<McqPrompt[]>(() => {
    if (inLapses) return lapsesMcq;
    if (deck === 'all') return mcqPrompts;
    if (deck === 'lapses') return lapsesMcq;
    return mcqPrompts.filter((p) => {
      const id = `v:${p.vocab.id}`;
      return deck === 'due' ? isDueId(id) : mistakeIds.has(id);
    });
  }, [inLapses, lapsesMcq, deck, mcqPrompts, cards, mistakeIds]);

  const filteredPairs = useMemo<MinimalPair[]>(() => {
    if (inLapses) return lapsesPairs;
    if (deck === 'all') return pairs;
    if (deck === 'lapses') return lapsesPairs;
    // pron 항목은 SRS 카드가 없어 due/mistakes 판별에서 제외 (pron-only 그룹은 'all' 전용)
    return pairs.filter((g) =>
      g.items.some((it) => {
        if (it.source !== 'vocab') return false;
        const id = `v:${it.vocabId}`;
        return deck === 'due' ? isDueId(id) : mistakeIds.has(id);
      }),
    );
  }, [inLapses, lapsesPairs, deck, pairs, cards, mistakeIds]);

  // 모드별 칩 뱃지 카운트 (현재 모드의 source 리스트 기준)
  const deckCounts = useMemo(() => {
    const now = Date.now();
    const isDue = (id: string): boolean => {
      const c = cards[id];
      return !c || new Date(c.due).getTime() <= now;
    };
    if (mode === 'sentence') {
      let due = 0, mis = 0;
      for (const p of prompts) {
        const id = srsCardIdFromPromptId(p.id);
        if (!id) continue;
        if (isDue(id)) due++;
        if (mistakeIds.has(id)) mis++;
      }
      return { due, mistakes: mis, all: prompts.length };
    }
    if (mode === 'mcq') {
      let due = 0, mis = 0;
      for (const p of mcqPrompts) {
        const id = `v:${p.vocab.id}`;
        if (isDue(id)) due++;
        if (mistakeIds.has(id)) mis++;
      }
      return { due, mistakes: mis, all: mcqPrompts.length };
    }
    let due = 0, mis = 0;
    for (const g of pairs) {
      // pron 항목은 SRS 카드가 없어 due/mistakes 카운트에서 제외
      const vocabItems = g.items.filter((it) => it.source === 'vocab');
      if (vocabItems.some((it) => isDue(`v:${it.vocabId}`))) due++;
      if (vocabItems.some((it) => mistakeIds.has(`v:${it.vocabId}`))) mis++;
    }
    return { due, mistakes: mis, all: pairs.length };
  }, [mode, prompts, mcqPrompts, pairs, cards, mistakeIds]);

  const lapsesCount =
    mode === 'sentence' ? lapsesSentence.length
    : mode === 'mcq' ? lapsesMcq.length
    : lapsesPairs.length;

  // SRS 카드가 존재하도록 보장 — 게임 시작 직후 grade가 호출되어도 신규 카드로 잡힌다.
  useEffect(() => {
    if (!playing) return;
    if (mode === 'mcq') ensure(filteredMcqPrompts.map((p) => `v:${p.vocab.id}`));
    else if (mode === 'pairs') {
      const ids = new Set<string>();
      for (const g of filteredPairs) {
        for (const it of g.items) {
          // pron 항목은 SRS 카드 없음 — ensure 대상 아님 (vocabId가 'pron:...' 형태)
          if (it.source === 'vocab') ids.add(`v:${it.vocabId}`);
        }
      }
      ensure(Array.from(ids));
    } else if (mode === 'sentence') {
      const ids: string[] = [];
      for (const p of filteredSentencePrompts) {
        const id = srsCardIdFromPromptId(p.id);
        if (id) ids.push(id);
      }
      ensure(ids);
    }
  }, [playing, mode, filteredMcqPrompts, filteredPairs, filteredSentencePrompts, ensure]);

  // 정/오답 → SRS grade 라우팅 + 오답이면 현재 모드 lapses에 누적 (중복 방지)
  // rtMs/signalLen이 주어지면 SM-2에서 4단계(easy/good/hard/again)로 추정한다.
  // Leitner는 추정과 무관하게 correct→good/wrong→again (boolean과 동등 표현).
  const onVocabResult = (vocabId: string, correct: boolean, rtMs?: number, signalLen?: number): void => {
    const g = estimateGrade({ correct, rtMs, signalLen, algorithm: fcAlgorithm });
    grade(`v:${vocabId}`, g, fcAlgorithm);
    if (correct || inLapses) return;
    if (mode === 'mcq') {
      const hit = mcqPrompts.find((p) => p.vocab.id === vocabId);
      if (!hit) return;
      setLapsesMcq((prev) =>
        prev.some((x) => x.vocab.id === vocabId) ? prev : [...prev, hit],
      );
    }
    // sentence는 onSentenceResult에서 promptId로 직접 처리
    // pairs는 onPairsResult에서 noEasy 캡과 함께 별도 처리
  };

  // 대조쌍 전용 — 청해 변별 과제는 의미 회상이 아니므로 'easy' 승격을 막아
  // SM-2 ease factor 가 청해 정답률만으로 과대 추정되는 것을 차단한다.
  // pron 항목(vocabId가 'pron:...')은 SRS 카드가 없어 grade 호출은 건너뛰고
  // 오답 누적(lapses)만 처리 — 같은 세션 내 재투입은 유지된다.
  const onPairsResult = (vocabId: string, correct: boolean, rtMs?: number, signalLen?: number): void => {
    const isPron = vocabId.startsWith('pron:');
    if (!isPron) {
      const g = estimateGrade({ correct, rtMs, signalLen, algorithm: fcAlgorithm, noEasy: true });
      grade(`v:${vocabId}`, g, fcAlgorithm);
    }
    if (correct || inLapses) return;
    const hit = pairs.find((p) => p.items.some((it) => it.vocabId === vocabId));
    if (!hit) return;
    setLapsesPairs((prev) =>
      prev.some((p) => p.items.some((it) => it.vocabId === vocabId)) ? prev : [...prev, hit],
    );
  };

  // 다중 소스 grade 라우팅 — example/dialog/scenario는 각각 v:/d:/s: 카드로 그레이딩,
  // grammarExample/question은 SRS 카드가 없어 SRS 갱신은 건너뛰고 lapses 누적만 처리.
  const onSentenceResult = (promptId: string, correct: boolean, rtMs?: number, signalLen?: number): void => {
    const id = srsCardIdFromPromptId(promptId);
    if (id) {
      const g = estimateGrade({ correct, rtMs, signalLen, algorithm: fcAlgorithm });
      grade(id, g, fcAlgorithm);
    }
    if (correct || inLapses) return;
    const hit = prompts.find((p) => p.id === promptId);
    if (!hit) return;
    setLapsesSentence((prev) =>
      prev.some((x) => x.id === promptId) ? prev : [...prev, hit],
    );
  };

  // 모드/범위/덱 전환 시 진행 중인 게임 종료 + 덱 상태 초기화
  useEffect(() => {
    setPlaying(false);
    setInLapses(false);
  }, [mode, lessonSel, deck]);

  // 모드/범위 전환 시 lapses 누적도 초기화 (lapses는 모드 한정 의미만 있음)
  useEffect(() => {
    setLapsesSentence([]);
    setLapsesMcq([]);
    setLapsesPairs([]);
  }, [mode, lessonSel]);

  // 오답 재투입 칩 클릭 → 즉시 게임 진입 (1클릭). Flashcards의 startLapses와 동일한 UX.
  const enterLapses = (): void => {
    if (lapsesCount === 0) return;
    setInLapses(true);
    setPlaying(true);
  };
  const pickDeck = (d: Deck): void => {
    setInLapses(false);
    setDeck(d);
  };

  // 대조쌍 모드에서는 권 단위 선택만 의미 있음 (단음절 단어 풀이 좁아 과 단위로 자르면 그룹이 거의 안 나옴).
  // mode 전환 시 부분 선택된 권을 "권 전체 선택"으로 격상 → 사용자 의도 보존.
  useEffect(() => {
    if (mode !== 'pairs') return;
    if (lessonSel.size === 0) return;
    const next = new Set(lessonSel);
    for (const vol of [1, 2, 3] as const) {
      const list = lessonGroups[vol];
      if (list.length === 0) continue;
      const anyOn = list.some((l) => next.has(l.id));
      if (anyOn) for (const l of list) next.add(l.id);
    }
    if (next.size !== lessonSel.size) setLessonSel(next);
  }, [mode, lessonGroups, lessonSel, setLessonSel]);

  // 현재 모드에서 출제 가능한 문제 수 (덱·lapses 반영)
  const playableCount =
    mode === 'sentence' ? filteredSentencePrompts.length
    : mode === 'mcq' ? filteredMcqPrompts.length
    : filteredPairs.length;

  // 시작 disabled 조건 — mcq는 4지선다라 4개 미만이면 distractor가 부족하지만,
  // 그 컷오프는 같은 풀(mcqPrompts) 전체 크기로 잡아야 함. filteredMcqPrompts가 4 미만이라도
  // pool은 mcqPrompts 전체이므로 출제는 가능 → playableCount === 0만 막는다.
  const startDisabled = playableCount === 0;

  return (
    <div className="space-y-4">
      {/* 덱 선택 — Flashcards와 동일 패턴, 즐겨찾기는 퀴즈에 무의미하므로 제외 */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1" role="tablist" aria-label="덱 선택">
        <DeckChip
          on={deck === 'due' && !inLapses}
          onClick={() => pickDeck('due')}
          label="복습 대상"
          badge={deckCounts.due}
        />
        <DeckChip
          on={deck === 'mistakes' && !inLapses}
          onClick={() => pickDeck('mistakes')}
          label="오답노트"
          badge={deckCounts.mistakes}
          icon={<AlertTriangle size={14} aria-hidden />}
        />
        <DeckChip
          on={inLapses}
          onClick={enterLapses}
          label="오답 재투입"
          badge={lapsesCount}
          disabled={lapsesCount === 0}
        />
        <DeckChip
          on={deck === 'all' && !inLapses}
          onClick={() => pickDeck('all')}
          label="전체"
          badge={deckCounts.all}
        />
      </div>

      {/* 레슨 범위 필터 — 문장 조립은 과 단위, 대조쌍은 권 단위 */}
      <LessonMultiFilter
        groups={lessonGroups}
        selected={lessonSel}
        onChange={setLessonSel}
        granularity={mode === 'pairs' ? 'vol' : 'lesson'}
      />

      {/* 안내 */}
      {!playing && (
        <div className="rounded-2xl border border-divider bg-surface p-6 space-y-3">
          {mode === 'sentence' && (
            <>
              <p className="text-fg font-semibold">문장 조립 퀴즈</p>
              <p className="text-sm text-muted">
                한국어 뜻을 보고 중국어 단어 토큰을 순서대로 탭하여 문장을 만드세요.
                일상 회화·전도 회화·단어 예문·실전 시나리오·어법 예문·본문 질문에서 출제됩니다 — 본문·성경 인용은 문어체라 제외.
                {(deck === 'due' || deck === 'mistakes') && !inLapses && (
                  <> · <b className="text-fg">{deck === 'due' ? '복습 대상' : '오답노트'}</b> 모드는 SRS 카드가 있는 항목(예문·회화·시나리오)에서만 출제됩니다 — 어법 예문·본문 질문은 전체 덱에서만 풀 수 있어요.</>
                )}
              </p>
              <p className="text-xs text-muted">
                출제 가능: {filteredSentencePrompts.length}문제
                {inLapses ? ' (오답 재투입)' : ` (${deckLabel(deck)})`}
              </p>
            </>
          )}
          {mode === 'mcq' && (
            <>
              <p className="text-fg font-semibold">4지선다 퀴즈</p>
              <p className="text-sm text-muted">
                단어를 보고 뜻을 고르거나, 뜻을 보고 단어를 고릅니다. 보기는 같은 범위의 다른 단어에서 자동 추출됩니다.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">방향:</span>
                <button
                  type="button"
                  onClick={() => setMcqDir((d) => (d === 'zh2ko' ? 'ko2zh' : 'zh2ko'))}
                  className="inline-flex items-center gap-1 rounded-full border border-divider bg-surface text-fg text-xs font-semibold px-3 py-1"
                  aria-label="방향 전환"
                >
                  <ArrowLeftRight size={12} aria-hidden />
                  {mcqDir === 'zh2ko' ? '中→韓' : '韓→中'}
                </button>
              </div>
              <p className="text-xs text-muted">
                출제 가능: {filteredMcqPrompts.length}문제
                {inLapses ? ' (오답 재투입)' : ` (${deckLabel(deck)})`}
              </p>
            </>
          )}
          {mode === 'pairs' && (
            <>
              <p className="text-fg font-semibold">최소 대조쌍 듣기</p>
              <p className="text-sm text-muted">
                같은 무성조 발음의 단어 중에서 들리는 성조를 변별하는 미니 게임입니다.
              </p>
              <p className="text-xs text-muted">
                출제 가능 그룹: {filteredPairs.length}개
                {inLapses ? ' (오답 재투입)' : ` (${deckLabel(deck)})`}
              </p>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying(true)}
              disabled={startDisabled}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-5 py-2.5 disabled:opacity-40"
            >
              {inLapses ? `오답 ${lapsesCount}문제 다시 풀기` : '시작'}
            </button>
            {!inLapses && lapsesCount > 0 && (
              // 오답 재투입을 안내 카드에서도 1클릭으로 — 칩과 중복이지만 흐름이 자연스러움
              <button
                type="button"
                onClick={enterLapses}
                className="inline-flex items-center gap-2 rounded-full bg-accent text-white font-semibold px-4 py-2 text-sm"
              >
                <AlertTriangle size={14} aria-hidden /> 오답 {lapsesCount}문제 재투입
              </button>
            )}
          </div>
        </div>
      )}

      {playing && mode === 'sentence' && (
        <SentenceBuilderGame
          key={`s:${deck}:${inLapses ? 'lap' : 'norm'}`}
          prompts={filteredSentencePrompts}
          tokenPool={prompts}
          ttsRate={ttsRate}
          ttsVoiceURI={ttsVoiceURI}
          onExit={() => setPlaying(false)}
          onResult={onSentenceResult}
        />
      )}
      {playing && mode === 'mcq' && (
        <McqGame
          key={`m:${deck}:${inLapses ? 'lap' : 'norm'}`}
          prompts={filteredMcqPrompts}
          distractorPool={mcqPrompts}
          direction={mcqDir}
          ttsRate={ttsRate}
          ttsVoiceURI={ttsVoiceURI}
          onExit={() => setPlaying(false)}
          onResult={onVocabResult}
        />
      )}
      {playing && mode === 'pairs' && (
        <MinimalPairsGame
          key={`p:${deck}:${inLapses ? 'lap' : 'norm'}`}
          pairs={filteredPairs}
          ttsRate={ttsRate}
          ttsVoiceURI={ttsVoiceURI}
          onExit={() => setPlaying(false)}
          onResult={onPairsResult}
        />
      )}
    </div>
  );
}

function deckLabel(d: Deck): string {
  return d === 'due' ? '복습 대상' : d === 'mistakes' ? '오답노트' : d === 'lapses' ? '오답 재투입' : '전체';
}

function DeckChip({
  on, onClick, label, badge, icon, disabled,
}: {
  on: boolean; onClick: () => void; label: string; badge: number; icon?: JSX.Element; disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      role="tab"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold border whitespace-nowrap',
        on ? 'bg-primary text-white border-primary'
           : disabled ? 'bg-surface text-muted/50 border-divider/50 opacity-60'
                      : 'bg-surface text-muted border-divider',
      )}
    >
      {icon}
      {label}
      <span className="text-xs opacity-80">({badge})</span>
    </button>
  );
}

function LessonMultiFilter({
  groups, selected, onChange, granularity = 'lesson',
}: {
  groups: Record<1 | 2 | 3, Array<{ id: string; no: number; label: string }>>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  granularity?: 'lesson' | 'vol';
}): JSX.Element {
  const totalCount = groups[1].length + groups[2].length + groups[3].length;
  const volsFullyOn: number[] = [];
  for (const v of [1, 2, 3] as const) {
    const list = groups[v];
    if (list.length > 0 && list.every((l) => selected.has(l.id))) volsFullyOn.push(v);
  }
  const summary = (() => {
    if (selected.size === 0) return '전체';
    if (granularity === 'vol') {
      if (volsFullyOn.length === 3) return '전체';
      if (volsFullyOn.length > 0) return volsFullyOn.map((v) => `${v}권`).join(' · ');
      return '선택 없음';
    }
    if (selected.size === 1) {
      const id = Array.from(selected)[0];
      for (const k of [1, 2, 3] as const) {
        const hit = groups[k].find((l) => l.id === id);
        if (hit) return `${k}권.${hit.label}`;
      }
    }
    return `${selected.size}/${totalCount}개 선택`;
  })();

  const toggleOne = (id: string): void => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };
  const toggleVol = (vol: 1 | 2 | 3): void => {
    const next = new Set(selected);
    const list = groups[vol];
    const allOn = list.length > 0 && list.every((l) => next.has(l.id));
    if (allOn) for (const l of list) next.delete(l.id);
    else for (const l of list) next.add(l.id);
    onChange(next);
  };
  const clear = (): void => onChange(new Set());

  return (
    <details className="group rounded-xl border border-divider bg-surface text-xs">
      <summary className="cursor-pointer select-none px-3 py-2 flex items-center justify-between w-full gap-2 list-none [&::-webkit-details-marker]:hidden">
        <span className="text-muted shrink-0">범위</span>
        <span className="text-fg font-semibold truncate flex-1 text-right">{summary}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className="shrink-0 text-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="px-3 pb-3 space-y-3">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={clear}
            disabled={selected.size === 0}
            className="text-xs text-primary font-semibold disabled:opacity-40"
          >
            전체 해제
          </button>
        </div>
        {([1, 2, 3] as const).map((vol) => {
          const list = groups[vol];
          if (list.length === 0) return null;
          const allOn = list.every((l) => selected.has(l.id));
          const someOn = !allOn && list.some((l) => selected.has(l.id));
          return (
            <div key={vol} className="rounded-lg border border-divider">
              <label className="flex items-center gap-2 px-3 py-2 cursor-pointer bg-surface">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => { if (el) el.indeterminate = someOn; }}
                  onChange={() => toggleVol(vol)}
                  aria-label={`${vol}권 전체 선택`}
                />
                <span className="font-semibold text-fg">{vol}권 전체</span>
                <span className="text-muted ml-auto">{list.length}과</span>
              </label>
              {granularity === 'lesson' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 px-3 py-2 border-t border-divider">
                  {list.map((l) => {
                    const on = selected.has(l.id);
                    return (
                      <label key={l.id} className="flex items-center gap-2 py-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleOne(l.id)}
                          aria-label={`${vol}권.${l.label}`}
                        />
                        <span className={cn('truncate', on ? 'text-fg' : 'text-muted')}>{l.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={(e) => {
              const det = (e.currentTarget.closest('details')) as HTMLDetailsElement | null;
              if (det) det.open = false;
            }}
            className="inline-flex items-center gap-1 rounded-full bg-primary text-white font-semibold px-4 py-1.5 text-xs"
            aria-label="레슨 필터 패널 닫기"
          >
            <ChevronDown size={12} aria-hidden className="rotate-180" /> 닫기
          </button>
        </div>
      </div>
    </details>
  );
}
