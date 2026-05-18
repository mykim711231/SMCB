/**
 * Lazily fetches and rehydrates the prebuilt MiniSearch index.
 * The index file is only loaded the first time the Search page renders
 * (~1 MB uncompressed, ~270 KB gzipped). Cached for the session.
 *
 * Result resolution: stored fields are minimal (`lessonId`, `kind`);
 * the actual text snippet is rebuilt by parsing the document id
 * (`${lessonId}::${kind}::${...}`) against the lesson JSON.
 */
import MiniSearch from 'minisearch';
import type { Lesson, Verse } from '@/types/lesson';
import { loadAllLessons } from '@/data/loaders';

export type SearchKind =
  | 'title' | 'body' | 'vocab' | 'bible'
  | 'dialog' | 'grammar' | 'pron' | 'scenario' | 'question';

export type SearchHit = {
  id: string;
  lessonId: string;
  kind: SearchKind;
  score: number;
  snippet: Verse | { zh: string; pinyin: string; ko: string; ref?: string };
  lessonTitleKo: string;
  lessonTitleZh: string;
};

let msPromise: Promise<MiniSearch> | null = null;
let lessonsPromise: Promise<Lesson[]> | null = null;

const HANZI_RE = /[一-鿿]/;
const SPLIT_RE = /[\s\p{P}]+/u;
function tokenize(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const chunk of text.split(SPLIT_RE)) {
    if (!chunk) continue;
    let buf = '';
    for (const ch of chunk) {
      if (HANZI_RE.test(ch)) {
        if (buf) { out.push(buf); buf = ''; }
        out.push(ch);
      } else {
        buf += ch;
      }
    }
    if (buf) out.push(buf);
  }
  return out;
}
function processTerm(term: string): string | null {
  const t = term.toLowerCase().trim();
  if (!t) return null;
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function loadIndex(): Promise<MiniSearch> {
  if (msPromise) return msPromise;
  msPromise = (async () => {
    const mod = await import('@/data/search-index.json');
    const json = (mod.default ?? mod) as Record<string, unknown>;
    return MiniSearch.loadJS(json as Parameters<typeof MiniSearch.loadJS>[0], {
      fields: ['zh', 'pinyin', 'ko', 'ref'],
      storeFields: ['lessonId', 'kind'],
      tokenize,
      processTerm,
      searchOptions: { prefix: true, fuzzy: 0.1 },
    });
  })();
  return msPromise;
}

async function loadLessonsOnce(): Promise<Lesson[]> {
  if (!lessonsPromise) lessonsPromise = loadAllLessons();
  return lessonsPromise;
}

function resolveSnippet(lesson: Lesson, kind: SearchKind, parts: string[]): SearchHit['snippet'] {
  switch (kind) {
    case 'title':
      return { zh: lesson.titleZh, pinyin: lesson.titlePinyin, ko: lesson.titleKo };
    case 'body': {
      const v = lesson.body[Number(parts[0])];
      return v ?? { zh: '', pinyin: '', ko: '' };
    }
    case 'vocab': {
      const id = parts[0];
      const v = lesson.vocab.find((x) => x.id === id);
      return v ? { zh: v.word, pinyin: v.pinyin, ko: v.meaning } : { zh: '', pinyin: '', ko: '' };
    }
    case 'bible': {
      const b = lesson.bible[Number(parts[0])];
      if (!b) return { zh: '', pinyin: '', ko: '' };
      return { ...b.text, ref: `${b.ref} / ${b.refKo}` };
    }
    case 'grammar': {
      const g = lesson.grammar[Number(parts[0])];
      return g ? { zh: g.pattern, pinyin: '', ko: g.meaningKo } : { zh: '', pinyin: '', ko: '' };
    }
    case 'pron': {
      const p = lesson.pronunciation[Number(parts[0])];
      return p ? { zh: p.hanzi, pinyin: p.pinyin, ko: `${p.ko} · ${p.note}` } : { zh: '', pinyin: '', ko: '' };
    }
    case 'dialog': {
      // Format: dialogDaily::di::li OR dialogGospel::di::li
      const group = parts[0] as 'dialogDaily' | 'dialogGospel';
      const di = Number(parts[1]);
      const li = Number(parts[2]);
      const list = group === 'dialogGospel' ? lesson.dialogGospel : lesson.dialogDaily;
      const v = list[di]?.lines[li];
      return v ?? { zh: '', pinyin: '', ko: '' };
    }
    case 'scenario': {
      const s = lesson.scenarios[Number(parts[0])];
      return s ? { zh: s.title, pinyin: '', ko: s.body.slice(0, 120) } : { zh: '', pinyin: '', ko: '' };
    }
    case 'question': {
      const q = lesson.questions[Number(parts[0])];
      return q ?? { zh: '', pinyin: '', ko: '' };
    }
  }
}

export async function search(query: string, limit = 50): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const [ms, lessons] = await Promise.all([loadIndex(), loadLessonsOnce()]);
  const lessonById = new Map(lessons.map((l) => [l.id, l]));

  const raw = ms.search(q, { combineWith: 'AND' });
  const top = raw.slice(0, limit);

  const hits: SearchHit[] = [];
  for (const r of top) {
    const idStr = String(r.id);
    const [lessonId, kindRaw, ...rest] = idStr.split('::');
    const lesson = lessonById.get(lessonId);
    if (!lesson) continue;
    const kind = (r.kind as SearchKind) ?? (kindRaw as SearchKind);
    hits.push({
      id: idStr,
      lessonId,
      kind,
      score: r.score,
      snippet: resolveSnippet(lesson, kind, rest),
      lessonTitleKo: lesson.titleKo,
      lessonTitleZh: lesson.titleZh,
    });
  }
  return hits;
}

export const KIND_LABELS: Record<SearchKind, string> = {
  title: '제목',
  body: '본문',
  vocab: '어휘',
  bible: '성경',
  dialog: '회화',
  grammar: '어법',
  pron: '발음',
  scenario: '상황',
  question: '질문',
};
