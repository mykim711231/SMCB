export type Verse = {
  zh: string;
  pinyin: string;
  ko: string;
};

export type VocabEntry = {
  id: string;
  word: string;
  pinyin: string;
  pos: string;
  meaning: string;
  hanjaNote?: string;
  example?: Verse;
};

export type PronRow = {
  hanzi: string;
  pinyin: string;
  ko: string;
  note: string;
};

export type GrammarPoint = {
  pattern: string;
  meaningKo: string;
  examples: Verse[];
  note?: string;
};

export type BibleQuote = {
  ref: string;
  refKo: string;
  text: Verse;
};

export type Dialog = {
  role?: string;
  lines: Verse[];
};

export type ScenarioSegment =
  | { kind: 'verse'; verse: Verse; prefix?: string }
  | { kind: 'text'; text: string };

export type Scenario = {
  title: string;
  segments: ScenarioSegment[];
};

export type Question = Verse;

export type Lesson = {
  id: string;
  vol: 1 | 2 | 3;
  no: number;
  titleZh: string;
  titlePinyin: string;
  titleKo: string;
  body: Verse[];
  vocab: VocabEntry[];
  pronunciation: PronRow[];
  grammar: GrammarPoint[];
  bible: BibleQuote[];
  dialogDaily: Dialog[];
  dialogGospel: Dialog[];
  scenarios: Scenario[];
  questions: Question[];
};

export type LessonMeta = {
  id: string;
  vol: 1 | 2 | 3;
  no: number;
  titleZh: string;
  titlePinyin: string;
  titleKo: string;
};

export type AppendixCategory = 'appendix' | 'pronunciation';

export type Appendix = {
  id: string;
  category: AppendixCategory;
  title: string;
  markdown: string;
  /**
   * 부록에서 추출한 학습 가능 단어 목록.
   *   - 부록1(기독교 용어집): 표 행을 파싱하여 80+ 항목.
   *   - 다른 부록은 비어있음.
   * Flashcards/Quiz/SRS는 lessonId 자리에 Appendix.id(예: "appendix1")를 사용한다.
   */
  vocab?: VocabEntry[];
};
