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
import type { Lesson } from '../src/types/lesson.js';

const DATA_DIR = resolve(process.cwd(), 'src/data');
const OUT_FILE = resolve(DATA_DIR, 'search-index.json');

type SearchDoc = {
  id: string;
  lessonId: string;
  lessonNo: number;
  vol: 1 | 2 | 3;
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

    l.vocab.forEach((v) =>
      docs.push({
        ...base,
        id: `${l.id}::vocab::${v.id}`,
        kind: 'vocab',
        zh: v.word,
        pinyin: v.pinyin,
        ko: v.meaning,
      }),
    );

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

    l.grammar.forEach((g, i) =>
      docs.push({
        ...base,
        id: `${l.id}::grammar::${i}`,
        kind: 'grammar',
        zh: g.pattern,
        pinyin: '',
        ko: g.meaningKo,
      }),
    );

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

    l.scenarios.forEach((s, i) =>
      docs.push({
        ...base,
        id: `${l.id}::scenario::${i}`,
        kind: 'scenario',
        zh: s.title,
        pinyin: '',
        ko: s.body.slice(0, 240),
      }),
    );

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
  const docs = buildDocs(lessons);

  // Minimal stored fields: just enough to navigate to source.
  // Actual text snippets are resolved from lesson JSON on click.
  const ms = new MiniSearch({
    fields: ['zh', 'pinyin', 'ko', 'ref'],
    storeFields: ['lessonId', 'kind'],
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
