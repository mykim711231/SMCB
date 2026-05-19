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
import type { Appendix, Lesson, Verse } from '@/types/lesson';
import { loadAllLessons, loadAppendices } from '@/data/loaders';

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
let appsPromise: Promise<Appendix[]> | null = null;

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
      // storeFields 비움 — id 문자열에서 lessonId/kind를 직접 파싱한다 (인덱스 -12%).
      storeFields: [],
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

async function loadAppendicesOnce(): Promise<Appendix[]> {
  if (!appsPromise) appsPromise = loadAppendices();
  return appsPromise;
}

/**
 * doc id의 kindRaw를 SearchKind로 정규화.
 * storedFields 미사용 (인덱스 -12%)이라 r.kind가 비어, id의 두 번째 토큰만으로 분류.
 *   - vocabEx       → vocab   (단어 예문도 단어 검색 결과로 표시)
 *   - grammarEx     → grammar (어법 예문도 어법 결과로 표시)
 *   - dialogDaily/Gospel → dialog
 */
function normalizeKind(kindRaw: string): SearchKind {
  if (kindRaw === 'vocabEx') return 'vocab';
  if (kindRaw === 'grammarEx') return 'grammar';
  if (kindRaw === 'dialogDaily' || kindRaw === 'dialogGospel') return 'dialog';
  return kindRaw as SearchKind;
}

function resolveSnippet(
  lesson: Lesson,
  kind: SearchKind,
  kindRaw: string,
  parts: string[],
): SearchHit['snippet'] {
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
      if (!v) return { zh: '', pinyin: '', ko: '' };
      // vocabEx → 매칭된 예문을 snippet으로 보여주고, ko에 단어/뜻을 부가.
      if (kindRaw === 'vocabEx' && v.example) {
        return {
          zh: v.example.zh,
          pinyin: v.example.pinyin,
          ko: `${v.example.ko} · 예문: ${v.word} (${v.meaning})`,
        };
      }
      return { zh: v.word, pinyin: v.pinyin, ko: v.meaning };
    }
    case 'bible': {
      const b = lesson.bible[Number(parts[0])];
      if (!b) return { zh: '', pinyin: '', ko: '' };
      return { ...b.text, ref: `${b.ref} / ${b.refKo}` };
    }
    case 'grammar': {
      const g = lesson.grammar[Number(parts[0])];
      if (!g) return { zh: '', pinyin: '', ko: '' };
      // grammarEx → 매칭된 예문(parts[1])을 snippet으로 보여주고, ko에 어법 패턴을 부가.
      if (kindRaw === 'grammarEx') {
        const e = g.examples[Number(parts[1])];
        if (e) {
          return {
            zh: e.zh,
            pinyin: e.pinyin,
            ko: `${e.ko} · 어법: ${g.pattern}`,
          };
        }
      }
      return { zh: g.pattern, pinyin: '', ko: g.meaningKo };
    }
    case 'pron': {
      const p = lesson.pronunciation[Number(parts[0])];
      return p ? { zh: p.hanzi, pinyin: p.pinyin, ko: `${p.ko} · ${p.note}` } : { zh: '', pinyin: '', ko: '' };
    }
    case 'dialog': {
      // id 형식: `${lessonId}::dialogDaily::${di}::${li}` 또는 `...::dialogGospel::...`
      // kindRaw로 group을 판별 (rest=parts에는 di/li만 남는다).
      const di = Number(parts[0]);
      const li = Number(parts[1]);
      const list = kindRaw === 'dialogGospel' ? lesson.dialogGospel : lesson.dialogDaily;
      const v = list[di]?.lines[li];
      return v ?? { zh: '', pinyin: '', ko: '' };
    }
    case 'scenario': {
      const s = lesson.scenarios[Number(parts[0])];
      if (!s) return { zh: '', pinyin: '', ko: '' };
      const ko = s.segments
        .map((seg) => (seg.kind === 'verse' ? seg.verse.ko : seg.text))
        .filter(Boolean)
        .join(' ')
        .slice(0, 120);
      return { zh: s.title, pinyin: '', ko };
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
  const [ms, lessons, apps] = await Promise.all([
    loadIndex(),
    loadLessonsOnce(),
    loadAppendicesOnce(),
  ]);
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const appById = new Map(apps.map((a) => [a.id, a]));

  const raw = ms.search(q, { combineWith: 'AND' });
  const top = raw.slice(0, limit);

  const hits: SearchHit[] = [];
  for (const r of top) {
    const idStr = String(r.id);
    const [lessonId, kindRaw, ...rest] = idStr.split('::');
    const kind = normalizeKind(kindRaw);

    // 부록 vocab — lessonId가 "appendix"로 시작. 별도 Appendix 메타에서 vocab 룩업.
    if (lessonId.startsWith('appendix')) {
      const app = appById.get(lessonId);
      if (!app) continue;
      const v = app.vocab?.find((x) => x.id === rest[0]);
      if (!v) continue;
      hits.push({
        id: idStr,
        lessonId,
        kind,
        score: r.score,
        snippet: { zh: v.word, pinyin: v.pinyin, ko: v.meaning },
        lessonTitleKo: app.title,
        lessonTitleZh: app.title,
      });
      continue;
    }

    const lesson = lessonById.get(lessonId);
    if (!lesson) continue;
    hits.push({
      id: idStr,
      lessonId,
      kind,
      score: r.score,
      snippet: resolveSnippet(lesson, kind, kindRaw, rest),
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
