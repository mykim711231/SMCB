/**
 * 마라톤 모드 (/learn?mode=marathon)
 *
 * 선택한 범위(권/과)와 영역(본문/단어/예문/구절/회화/시나리오)에 속하는 모든
 * 카드의 zh를 권/과 순서로 순차 재생한다. 채점 없음, 듣기 집중용.
 *
 * variant='repeat' (/learn?mode=repeat, '5회 듣기'):
 *   같은 범위·영역 풀을 쓰되 카드마다 5회 반복하고, 회차가 갈수록 글자를 줄인다
 *   (1~2회 전체 표시 → 3~4회 한자만 → 5회 소리만). 귀로 익히는 집중 듣기.
 *
 * 표시 토글 — 한자/병음/한국어 각각 보이기 끄기 가능. TTS는 항상 zh로 재생.
 *
 * UX 결정:
 *   - 범위는 학습 페이지 공유 store(useLearnScope)를 그대로 사용 → 모드 전환 시
 *     플래시카드/Quiz에서 고른 범위가 마라톤에도 자동 반영.
 *   - 영역/표시는 settings store에 영구 저장하여 다음 진입 시 복원.
 *   - 부록은 마라톤 풀에서 제외 (별도 학습 흐름).
 */
import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { loadAllLessons, META } from '@/data/loaders';
import type { Lesson } from '@/types/lesson';
import {
  buildMarathonSources,
  type CardSource,
  type MarathonAreas,
} from '@/lib/flashcard-items';
import { useSettings } from '@/stores/settings';
import { useLearnScope } from '@/stores/learnScope';
import { LessonMultiFilter } from './Flashcards';
import MarathonPlayer from '@/components/flashcards/MarathonPlayer';
import { cn } from '@/lib/cn';

const AREA_LABELS: Array<{ key: keyof MarathonAreas; label: string; desc: string }> = [
  { key: 'body', label: '본문', desc: '레슨 본문' },
  { key: 'vocab', label: '단어', desc: '주요 어휘' },
  { key: 'example', label: '예문', desc: '주요 어휘 예문' },
  { key: 'bible', label: '구절', desc: '성경 인용' },
  { key: 'dialog', label: '회화', desc: '응용·전도 회화' },
  { key: 'scenario', label: '시나리오', desc: '실전 상황' },
];

export const REPEAT_TIMES = 5;

type Props = { variant?: 'marathon' | 'repeat' };

export default function Marathon({ variant = 'marathon' }: Props): JSX.Element {
  const isRepeat = variant === 'repeat';
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [started, setStarted] = useState(false);

  const areas = useSettings((s) => s.marathonAreas);
  const setAreas = useSettings((s) => s.setMarathonAreas);
  const show = useSettings((s) => s.marathonShow);
  const setShow = useSettings((s) => s.setMarathonShow);
  const ttsRate = useSettings((s) => s.ttsRate);
  const ttsVoiceURI = useSettings((s) => s.ttsVoiceURI);

  const lessonSel = useLearnScope((s) => s.lessonSel);
  const setLessonSel = useLearnScope((s) => s.setLessonSel);

  useEffect(() => {
    let cancelled = false;
    void loadAllLessons().then((ls) => { if (!cancelled) setLessons(ls); });
    return () => { cancelled = true; };
  }, []);

  const scopedLessons = useMemo<Lesson[]>(() => {
    if (lessonSel.size === 0) return lessons;
    return lessons.filter((l) => lessonSel.has(l.id));
  }, [lessons, lessonSel]);

  const cards = useMemo<CardSource[]>(
    () => buildMarathonSources(scopedLessons, areas),
    [scopedLessons, areas],
  );

  const lessonGroups = useMemo(() => {
    const byVol: Record<1 | 2 | 3, Array<{ id: string; no: number; label: string }>> = { 1: [], 2: [], 3: [] };
    for (const m of META) {
      const vol = m.vol as 1 | 2 | 3;
      byVol[vol].push({ id: m.id, no: m.no, label: `${String(m.no).padStart(2, '0')}과. ${m.titleKo}` });
    }
    for (const k of [1, 2, 3] as const) byVol[k].sort((a, b) => a.no - b.no);
    return byVol;
  }, []);

  const toggleArea = (k: keyof MarathonAreas): void => {
    setAreas({ ...areas, [k]: !areas[k] });
  };
  const toggleShow = (k: 'zh' | 'pinyin' | 'ko'): void => {
    setShow({ ...show, [k]: !show[k] });
  };
  const anyArea = (Object.values(areas) as boolean[]).some(Boolean);

  if (started) {
    return (
      <div className="space-y-3">
        <MarathonPlayer
          cards={cards}
          ttsRate={ttsRate}
          ttsVoiceURI={ttsVoiceURI}
          show={show}
          repeatTimes={isRepeat ? REPEAT_TIMES : undefined}
          stagedReveal={isRepeat}
          title={isRepeat ? `${REPEAT_TIMES}회 듣기` : undefined}
          onExit={() => setStarted(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {isRepeat
          ? <>한 문장을 <b className="text-fg">{REPEAT_TIMES}번</b>씩 들려준 뒤 다음으로 넘어갑니다. 1~2회는 전체 표시, 3~4회는 한자만, 5회째는 글자 없이 소리만 들려줘요. 채점은 없습니다.</>
          : '선택한 범위·영역의 카드를 권/과 순서대로 한 번씩 읽어줍니다. 채점은 없습니다.'}
      </p>

      <div className="rounded-2xl border border-divider bg-surface p-4 space-y-4">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg">범위</h2>
          <LessonMultiFilter
            groups={lessonGroups}
            selected={lessonSel}
            onChange={setLessonSel}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg">영역</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AREA_LABELS.map((a) => {
              const on = areas[a.key];
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => toggleArea(a.key)}
                  aria-pressed={on}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left',
                    on ? 'border-primary bg-primary-soft' : 'border-divider bg-surface',
                  )}
                >
                  <div className="text-sm font-semibold text-fg">{a.label}</div>
                  <div className="text-xs text-muted">{a.desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg">표시</h2>
          <div className="flex gap-2 flex-wrap">
            {([['zh', '한자'], ['pinyin', '병음'], ['ko', '한국어']] as const).map(([k, label]) => {
              const on = show[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleShow(k)}
                  aria-pressed={on}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm font-semibold',
                    on ? 'bg-primary text-white border-primary' : 'bg-surface text-muted border-divider',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            표시 토글은 음성 재생에 영향을 주지 않습니다 (항상 zh로 재생).
            {isRepeat && ' 5회 듣기에서는 1~2회차에 적용되고, 이후 회차는 글자를 줄여 갑니다.'}
          </p>
        </section>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          재생 대상: <b className="text-fg">{cards.length}</b>개
          {lessonSel.size > 0 && <span> · {lessonSel.size}과</span>}
        </p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          disabled={cards.length === 0 || !anyArea}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-5 py-2 font-semibold',
            cards.length === 0 || !anyArea
              ? 'bg-divider text-muted cursor-not-allowed'
              : 'bg-primary text-white',
          )}
        >
          <Play size={16} aria-hidden /> {isRepeat ? `${REPEAT_TIMES}회 듣기 시작` : '이어듣기 시작'}
        </button>
      </div>

      {!anyArea && (
        <p className="text-xs text-accent">영역을 하나 이상 선택해 주세요.</p>
      )}
    </div>
  );
}
