/**
 * SRS 통계 헬퍼: 연속 학습일(streak), 캘린더 히트맵, 박스 분포, 오답 카드 추출.
 *
 * 모든 함수는 순수하며 useSRS에 의존하지 않습니다 (테스트 친화).
 * 호출 측이 zustand selector로 데이터를 뽑아 전달합니다.
 */
import type { SRSCard, DailyStat } from '@/stores/srs';

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** 오늘 포함, 학습 기록이 있는 가장 긴 연속 일수. 오늘 학습이 없으면 어제부터 카운트. */
export function computeStreak(reviewsByDate: Record<string, DailyStat>, now = new Date()): number {
  let streak = 0;
  let cursor = new Date(now);
  // 오늘 학습 안 했으면 어제부터 시작 (오늘을 '미실시'로 간주하지 않고 연속 끊김 방지)
  if (!reviewsByDate[isoDate(cursor)] || reviewsByDate[isoDate(cursor)].reviewed === 0) {
    cursor = addDays(cursor, -1);
  }
  for (let i = 0; i < 3650; i++) {
    const key = isoDate(cursor);
    const v = reviewsByDate[key];
    if (v && v.reviewed > 0) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else break;
  }
  return streak;
}

export type HeatmapCell = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 };

/**
 * 캘린더형 히트맵 데이터를 생성. 일주일=7행, weeks주만큼의 열.
 * 각 칸: 그날 reviewed 수와 레벨(0~4).
 */
export function computeHeatmap(
  reviewsByDate: Record<string, DailyStat>,
  weeks = 12,
  now = new Date(),
): HeatmapCell[][] {
  // 끝나는 일요일까지 padding (한국 기준: 일=0)
  const end = new Date(now);
  const endDay = end.getDay();
  // 오늘이 일요일이면 다음 토요일까지 0칸 패딩 → 끝 열을 이번 주로 맞추기 위해 cur = 토요일
  const cur = addDays(end, 6 - endDay);
  // 시작일: cur에서 weeks*7 - 1일 전
  const start = addDays(cur, -(weeks * 7 - 1));
  // 모든 카운트의 max → 4단계 임계값 산출
  const allCounts: number[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const day = addDays(start, i);
    const v = reviewsByDate[isoDate(day)];
    allCounts.push(v?.reviewed ?? 0);
  }
  const max = Math.max(1, ...allCounts);
  const t1 = Math.max(1, Math.round(max * 0.25));
  const t2 = Math.max(t1 + 1, Math.round(max * 0.5));
  const t3 = Math.max(t2 + 1, Math.round(max * 0.75));

  // grid[week][day(0=일~6=토)]
  const grid: HeatmapCell[][] = Array.from({ length: weeks }, () => []);
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, w * 7 + d);
      const date = isoDate(day);
      const count = reviewsByDate[date]?.reviewed ?? 0;
      let level: HeatmapCell['level'] = 0;
      if (count >= t3) level = 4;
      else if (count >= t2) level = 3;
      else if (count >= t1) level = 2;
      else if (count > 0) level = 1;
      grid[w][d] = { date, count, level };
    }
  }
  return grid;
}

export type BoxDistribution = {
  newCount: number;
  byBox: Record<1 | 2 | 3 | 4 | 5, number>;
  total: number;
};

export function computeBoxDistribution(cards: Record<string, SRSCard>): BoxDistribution {
  const byBox: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let newCount = 0;
  let total = 0;
  for (const c of Object.values(cards)) {
    total += 1;
    const isNew = !c.lastReviewedAt && c.correctCount === 0 && c.wrongCount === 0;
    if (isNew) {
      newCount += 1;
      continue;
    }
    const b = (Math.max(1, Math.min(5, c.box)) as 1 | 2 | 3 | 4 | 5);
    byBox[b] += 1;
  }
  return { newCount, byBox, total };
}

/**
 * 오답 노트 후보:
 *   - 한 번 이상 채점됐고
 *   - wrongCount >= minWrong 또는
 *   - wrongCount / (wrongCount + correctCount) >= minRatio
 * 정확도가 낮은 순 → 최근 복습한 순으로 정렬.
 */
export function pickMistakeCards(
  cards: Record<string, SRSCard>,
  opts: { minWrong?: number; minRatio?: number } = {},
): SRSCard[] {
  const minWrong = opts.minWrong ?? 2;
  const minRatio = opts.minRatio ?? 0.4;
  const list: SRSCard[] = [];
  for (const c of Object.values(cards)) {
    const total = c.wrongCount + c.correctCount;
    if (total === 0) continue;
    const ratio = c.wrongCount / total;
    if (c.wrongCount >= minWrong || ratio >= minRatio) list.push(c);
  }
  list.sort((a, b) => {
    const ra = a.wrongCount / Math.max(1, a.wrongCount + a.correctCount);
    const rb = b.wrongCount / Math.max(1, b.wrongCount + b.correctCount);
    if (rb !== ra) return rb - ra;
    return (b.lastReviewedAt ?? '').localeCompare(a.lastReviewedAt ?? '');
  });
  return list;
}

/** 오늘 마지막 주를 (월~일 라벨, 매일 reviewed/correct) 7개 점으로 반환 (소형 차트용). */
export function lastNDays(
  reviewsByDate: Record<string, DailyStat>,
  n = 7,
  now = new Date(),
): Array<{ date: string; reviewed: number; correct: number }> {
  const out: Array<{ date: string; reviewed: number; correct: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(now, -i);
    const key = isoDate(d);
    const v = reviewsByDate[key] ?? { reviewed: 0, correct: 0 };
    out.push({ date: key, reviewed: v.reviewed, correct: v.correct });
  }
  return out;
}

/** 누적 총 학습수. */
export function totalReviews(reviewsByDate: Record<string, DailyStat>): { reviewed: number; correct: number } {
  let reviewed = 0;
  let correct = 0;
  for (const v of Object.values(reviewsByDate)) {
    reviewed += v.reviewed;
    correct += v.correct;
  }
  return { reviewed, correct };
}
