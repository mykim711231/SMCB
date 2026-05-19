/**
 * Builds the MiniSearch JSON index from generated lesson JSON.
 * Output: app/src/data/search-index.json
 *
 * Tokens: Hanzi (1-char tokens, no word boundary), pinyin (word tokens),
 *         Korean (word tokens). Stored fields are kept minimal to keep
 *         the index small (target <= 500KB uncompressed).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MiniSearch from 'minisearch';
import type { Appendix, Lesson } from '../src/types/lesson.js';

const DATA_DIR = resolve(process.cwd(), 'src/data');
const OUT_FILE = resolve(DATA_DIR, 'search-index.json');

type SearchDoc = {
  id: string;
  lessonId: string;
  lessonNo: number;
  // vol=0: 부록(appendix) — 정렬·필터 시 정규 권과 구분하기 위함. 저장되지 않으므로 검색 결과엔 영향 없음.
  vol: 0 | 1 | 2 | 3;
  kind: 'title' | 'body' | 'vocab' | 'bible' | 'dialog' | 'grammar' | 'pron' | 'scenario' | 'question';
  zh: string;
  pinyin: string;
  ko: string;
  ref?: string;
};

function loadLessons(): Lesson[] {
  const v1 = JSON.parse(readFileSync(resolve(DATA_DIR, 'lessons-vol1.json'), 'utf8')) as Lesson[];
  const v2 = JSON.parse(readFileSync(resolve(DATA_DIR, 'lessons-vol2.json'), 'utf8')) as Lesson[];
  const v3 = JSON.parse(readFileSync(resolve(DATA_DIR, 'lessons-vol3.json'), 'utf8')) as Lesson[];
  return [...v1, ...v2, ...v3];
}

function loadAppendices(): Appendix[] {
  return JSON.parse(readFileSync(resolve(DATA_DIR, 'appendices.json'), 'utf8')) as Appendix[];
}

function buildDocs(lessons: Lesson[]): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const l of lessons) {
    const base = { lessonId: l.id, lessonNo: l.no, vol: l.vol };

    docs.push({
      ...base,
      id: `${l.id}::title`,
      kind: 'title',
      zh: l.titleZh,
      pinyin: l.titlePinyin,
      ko: l.titleKo,
    });

    l.body.forEach((v, i) =>
      docs.push({
        ...base,
        id: `${l.id}::body::${i}`,
        kind: 'body',
        zh: v.zh,
        pinyin: v.pinyin,
        ko: v.ko,
      }),
    );

    l.vocab.forEach((v) => {
      docs.push({
        ...base,
        id: `${l.id}::vocab::${v.id}`,
        kind: 'vocab',
        zh: v.word,
        pinyin: v.pinyin,
        ko: v.meaning,
      });
      // 단어 예문도 별도 검색 doc로 — 같은 vocab 카드에서 lookup 되지만
      // 예문 본문(zh/pinyin/ko)으로도 직접 검색 가능해야 함.
      // 같은 lessonId/vocab.id 로 클릭 네비게이션 유지.
      if (v.example) {
        docs.push({
          ...base,
          id: `${l.id}::vocabEx::${v.id}`,
          kind: 'vocab',
          zh: v.example.zh,
          pinyin: v.example.pinyin,
          ko: v.example.ko,
        });
      }
    });

    l.bible.forEach((b, i) =>
      docs.push({
        ...base,
        id: `${l.id}::bible::${i}`,
        kind: 'bible',
        zh: b.text.zh,
        pinyin: b.text.pinyin,
        ko: b.text.ko,
        ref: `${b.ref} / ${b.refKo}`,
      }),
    );

    l.grammar.forEach((g, i) => {
      docs.push({
        ...base,
        id: `${l.id}::grammar::${i}`,
        kind: 'grammar',
        zh: g.pattern,
        pinyin: '',
        ko: g.meaningKo,
      });
      // 어법 예문도 검색 대상으로 — 같은 어법 패턴의 변형을 본문에서 떠올리기 위해
      // example zh/pinyin/ko를 별도 doc 으로 색인. 클릭 시 같은 lesson 으로 이동.
      g.examples.forEach((e, ei) =>
        docs.push({
          ...base,
          id: `${l.id}::grammarEx::${i}::${ei}`,
          kind: 'grammar',
          zh: e.zh,
          pinyin: e.pinyin,
          ko: e.ko,
        }),
      );
    });

    l.pronunciation.forEach((p, i) =>
      docs.push({
        ...base,
        id: `${l.id}::pron::${i}`,
        kind: 'pron',
        zh: p.hanzi,
        pinyin: p.pinyin,
        ko: p.ko,
      }),
    );

    l.dialogDaily.forEach((d, di) =>
      d.lines.forEach((v, li) =>
        docs.push({
          ...base,
          id: `${l.id}::dialogDaily::${di}::${li}`,
          kind: 'dialog',
          zh: v.zh,
          pinyin: v.pinyin,
          ko: v.ko,
        }),
      ),
    );

    l.dialogGospel.forEach((d, di) =>
      d.lines.forEach((v, li) =>
        docs.push({
          ...base,
          id: `${l.id}::dialogGospel::${di}::${li}`,
          kind: 'dialog',
          zh: v.zh,
          pinyin: v.pinyin,
          ko: v.ko,
        }),
      ),
    );

    l.scenarios.forEach((s, i) => {
      const verseSegs = s.segments.filter((seg) => seg.kind === 'verse');
      const zh = [s.title, ...verseSegs.map((seg) => (seg.kind === 'verse' ? seg.verse.zh : ''))]
        .filter(Boolean)
        .join(' ')
        .slice(0, 240);
      const pinyin = verseSegs
        .map((seg) => (seg.kind === 'verse' ? seg.verse.pinyin : ''))
        .filter(Boolean)
        .join(' ')
        .slice(0, 240);
      const ko = s.segments
        .map((seg) => (seg.kind === 'verse' ? seg.verse.ko : seg.text))
        .filter(Boolean)
        .join(' ')
        .slice(0, 240);
      docs.push({
        ...base,
        id: `${l.id}::scenario::${i}`,
        kind: 'scenario',
        zh,
        pinyin,
        ko,
      });
    });

    l.questions.forEach((q, i) =>
      docs.push({
        ...base,
        id: `${l.id}::question::${i}`,
        kind: 'question',
        zh: q.zh,
        pinyin: q.pinyin,
        ko: q.ko,
      }),
    );
  }
  return docs;
}

/**
 * 부록 vocab(현재는 부록1만)을 vocab kind로 색인.
 *   - doc.id 형식은 lesson vocab과 동일하게 `${appendixId}::vocab::${vocab.id}` 사용 → search.ts의
 *     resolveSnippet/route 분기는 lessonId 접두("appendix")로 판별.
 *   - lessonId 자리에 Appendix.id를 넣어 검색 결과 클릭 시 /appendix/{id} 로 라우팅 가능.
 *   - lessonNo=0, vol=0으로 표시 (정규 65과와 구분; storeFields 대상 아니므로 검색 결과엔 영향 없음).
 */
function buildAppendixDocs(apps: Appendix[]): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const a of apps) {
    if (!a.vocab || a.vocab.length === 0) continue;
    for (const v of a.vocab) {
      docs.push({
        id: `${a.id}::vocab::${v.id}`,
        lessonId: a.id,
        lessonNo: 0,
        vol: 0,
        kind: 'vocab',
        zh: v.word,
        pinyin: v.pinyin,
        ko: v.meaning,
      });
    }
  }
  return docs;
}

// Hanzi tokenizer: each character becomes a token.
// Pinyin / Korean: split on whitespace + punctuation.
const HANZI_RE = /[一-鿿]/;
const SPLIT_RE = /[\s\p{P}]+/u;

function tokenize(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  // Split on non-CJK boundaries first
  const chunks = text.split(SPLIT_RE);
  for (const chunk of chunks) {
    if (!chunk) continue;
    let buf = '';
    for (const ch of chunk) {
      if (HANZI_RE.test(ch)) {
        if (buf) {
          tokens.push(buf);
          buf = '';
        }
        tokens.push(ch);
      } else {
        buf += ch;
      }
    }
    if (buf) tokens.push(buf);
  }
  return tokens;
}

function processTerm(term: string): string | null {
  const t = term.toLowerCase().trim();
  if (!t) return null;
  // Strip pinyin tone marks for fuzzy matching
  const stripped = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return stripped;
}

function main(): void {
  const lessons = loadLessons();
  const apps = loadAppendices();
  const docs = [...buildDocs(lessons), ...buildAppendixDocs(apps)];

  // storedFields 비움 — search.ts가 documentId(`${lessonId}::${kind}::...`) 문자열에서
  //   lessonId/kind를 직접 파싱하므로 인덱스에 별도 저장하지 않아도 됨.
  // 효과: storedFields 154KB → 0KB (전체 -12%, ~1.15MB)
  const ms = new MiniSearch({
    fields: ['zh', 'pinyin', 'ko', 'ref'],
    storeFields: [],
    tokenize,
    processTerm,
    searchOptions: {
      prefix: true,
      fuzzy: 0.1,
    },
  });
  ms.addAll(docs);

  const json = JSON.stringify(ms.toJSON());
  writeFileSync(OUT_FILE, json, 'utf8');

  const sizeKB = Math.round(Buffer.byteLength(json, 'utf8') / 1024);
  console.log(`  search-index.json  (${docs.length} docs, ${sizeKB} KB)`);
}

main();
