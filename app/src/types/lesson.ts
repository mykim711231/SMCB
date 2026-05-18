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

export type Scenario = {
  title: string;
  body: string;
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

export type Appendix = {
  id: 'appendix1' | 'appendix2';
  title: string;
  markdown: string;
};
