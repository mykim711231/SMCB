/**
 * Lazy content loaders.
 *
 * - lessons-meta.json is statically imported (small, used everywhere for TOC/search).
 * - lessons-vol*.json are dynamic-imported per volume so the SW can lazy-cache them.
 * - appendices.json is dynamic-imported (used only on the Appendix pages).
 * - search-index.json is fetched on demand from the Search page.
 *
 * In-memory cache prevents re-parsing across navigations within a session.
 */
import type { Lesson, LessonMeta, Appendix, VocabEntry } from '@/types/lesson';
import metaJson from './lessons-meta.json';

export const META: LessonMeta[] = metaJson as LessonMeta[];

const volCache = new Map<1 | 2 | 3, Lesson[]>();
let appendicesCache: Appendix[] | null = null;

export async function loadVolume(vol: 1 | 2 | 3): Promise<Lesson[]> {
  const cached = volCache.get(vol);
  if (cached) return cached;
  let mod;
  if (vol === 1) mod = await import('./lessons-vol1.json');
  else if (vol === 2) mod = await import('./lessons-vol2.json');
  else mod = await import('./lessons-vol3.json');
  const data = (mod.default ?? mod) as Lesson[];
  volCache.set(vol, data);
  return data;
}

export async function loadLesson(id: string): Promise<Lesson | undefined> {
  const meta = META.find((m) => m.id === id);
  if (!meta) return undefined;
  const vol = await loadVolume(meta.vol);
  return vol.find((l) => l.id === id);
}

export async function loadAppendices(): Promise<Appendix[]> {
  if (appendicesCache) return appendicesCache;
  const mod = await import('./appendices.json');
  appendicesCache = (mod.default ?? mod) as Appendix[];
  return appendicesCache;
}

export async function loadAppendix(id: string): Promise<Appendix | undefined> {
  const list = await loadAppendices();
  return list.find((a) => a.id === id);
}

/** Returns all 65 lessons (loads all three volumes). Used by Flashcards/Search builders. */
export async function loadAllLessons(): Promise<Lesson[]> {
  const [v1, v2, v3] = await Promise.all([loadVolume(1), loadVolume(2), loadVolume(3)]);
  return [...v1, ...v2, ...v3];
}

/**
 * 부록에서 추출한 학습용 vocab을 lessonId 단위로 평탄화하여 반환.
 *   - lessonId 자리에 Appendix.id(예: "appendix1")를 사용 → Quiz/Flashcards가
 *     기존 (vocab, lessonId) 쌍 인터페이스와 충돌 없이 합칠 수 있음.
 *   - lessonTitleKo는 Appendix.title(예: "附录1 中文基督教词汇表") — 카드 헤더 표시용.
 *   - 부록1만 vocab을 가지고 다른 부록은 빈 배열.
 */
export async function loadAppendixVocabs(): Promise<
  Array<{ vocab: VocabEntry; lessonId: string; lessonTitleKo: string }>
> {
  const apps = await loadAppendices();
  const out: Array<{ vocab: VocabEntry; lessonId: string; lessonTitleKo: string }> = [];
  for (const a of apps) {
    if (!a.vocab) continue;
    for (const v of a.vocab) out.push({ vocab: v, lessonId: a.id, lessonTitleKo: a.title });
  }
  return out;
}
