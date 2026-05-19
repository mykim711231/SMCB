/**
 * 학습 페이지(/learn) 공유 범위 store.
 *
 * Flashcards·Quiz 모드 간에 "어떤 레슨 범위로 학습할지"를 공유한다.
 * 모드를 전환해도 사용자가 고른 범위가 유지되어, 같은 범위로 여러 학습 형태를 연달아 풀 수 있다.
 *
 * - lessonSel: 선택된 lessonId 집합. 빈 Set = 전체.
 * - 메모리 전용(persist 없음). 앱 새로고침 시 전체로 리셋되어 진입 장벽을 낮춘다.
 */
import { create } from 'zustand';

export type LearnScopeState = {
  lessonSel: Set<string>;
  setLessonSel: (next: Set<string>) => void;
  clearLessonSel: () => void;
};

export const useLearnScope = create<LearnScopeState>((set) => ({
  lessonSel: new Set<string>(),
  setLessonSel: (next) => set({ lessonSel: next }),
  clearLessonSel: () => set({ lessonSel: new Set<string>() }),
}));
