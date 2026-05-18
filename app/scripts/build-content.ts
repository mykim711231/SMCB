import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Lesson,
  LessonMeta,
  Verse,
  VocabEntry,
  PronRow,
  GrammarPoint,
  BibleQuote,
  Dialog,
  Scenario,
  Question,
  Appendix,
} from '../src/types/lesson.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const DOC_DIR = join(ROOT, 'Doc');
const OUT_DIR = join(__dirname, '..', 'src', 'data');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// ------------------------------ parsing helpers ------------------------------

type Section = { heading: string; lines: string[] };

const SECTION_RE = /^##\s+(.+?)\s*$/;

function splitSections(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const ln of lines) {
    const m = ln.match(SECTION_RE);
    if (m) {
      if (current) sections.push(current);
      current = { heading: m[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(ln);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function findSection(sections: Section[], keyword: string): Section | undefined {
  return sections.find((s) => s.heading.includes(keyword));
}

// Detect: zh line is a line with CJK characters and ending in CJK punctuation/letter
const HAS_CJK = /[一-鿿]/;
const HAS_PINYIN = /[a-zA-Z][a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀ]/;
const HAS_HANGUL = /[가-힯]/;

function cleanLine(s: string): string {
  return s.replace(/^\s*-\s*/, '').replace(/\s+/g, ' ').trim();
}

/** Parse trios of (zh / pinyin / ko) lines. Skips blanks and unrelated lines. */
function parseVerses(lines: string[]): Verse[] {
  const verses: Verse[] = [];
  const raw = lines.map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('>'));
  let i = 0;
  while (i < raw.length) {
    const a = raw[i];
    const b = raw[i + 1];
    const c = raw[i + 2];
    if (a && b && c && HAS_CJK.test(a) && HAS_PINYIN.test(b) && HAS_HANGUL.test(c)) {
      verses.push({ zh: cleanLine(a), pinyin: cleanLine(b), ko: cleanLine(c) });
      i += 3;
      continue;
    }
    i += 1;
  }
  return verses;
}

/** Vocab entries: `### N. word  /  pinyin  /  [pos]  /  meaning` followed by optional notes */
function parseVocab(section: Section | undefined, lessonId: string): VocabEntry[] {
  if (!section) return [];
  const out: VocabEntry[] = [];
  const lines = section.lines;
  let buf: string[] = [];

  const flush = (block: string[], idx: number) => {
    if (block.length === 0) return;
    const headerLine = block[0];
    const m = headerLine.match(/^###\s+\d+\.\s*(.+)$/);
    if (!m) return;
    const parts = m[1].split('/').map((s) => s.trim());
    const [word, pinyin, pos, meaning] = [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '', parts.slice(3).join(' / ').trim()];
    const entry: VocabEntry = {
      id: `${lessonId}_v${idx}`,
      word,
      pinyin,
      pos,
      meaning,
    };
    const noteMatch = block.find((l) => l.includes('한자 풀이'));
    if (noteMatch) entry.hanjaNote = noteMatch.replace(/^[-\s]*한자\s*풀이[:：]\s*/, '').trim();
    const exZh = block.find((l) => /^[-\s]*例句[:：]/.test(l));
    const exPin = block.find((l) => /^[-\s]*Pinyin[:：]/i.test(l));
    const exKo = block.find((l) => /^[-\s]*번역[:：]/.test(l));
    if (exZh && exPin && exKo) {
      entry.example = {
        zh: exZh.replace(/^[-\s]*例句[:：]\s*/, '').trim(),
        pinyin: exPin.replace(/^[-\s]*Pinyin[:：]\s*/i, '').trim(),
        ko: exKo.replace(/^[-\s]*번역[:：]\s*/, '').trim(),
      };
    }
    out.push(entry);
  };

  let idx = 0;
  for (const ln of lines) {
    if (ln.startsWith('### ')) {
      flush(buf, idx);
      idx = out.length + 1;
      buf = [ln];
    } else if (buf.length > 0) {
      buf.push(ln);
    }
  }
  flush(buf, idx);
  return out;
}

/** Pronunciation table: `| 한자 | 병음 | 한국어 | 주의점 |` */
function parsePronunciation(section: Section | undefined): PronRow[] {
  if (!section) return [];
  const rows: PronRow[] = [];
  const tableLines = section.lines.filter((l) => l.trim().startsWith('|'));
  for (const line of tableLines) {
    const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 4) continue;
    if (cells[0] === '한자' || /^-+$/.test(cells[0])) continue;
    rows.push({ hanzi: cells[0], pinyin: cells[1], ko: cells[2], note: cells[3] });
  }
  return rows;
}

/** Grammar: each `### N. "pattern" — meaning` followed by bullet examples */
function parseGrammar(section: Section | undefined): GrammarPoint[] {
  if (!section) return [];
  const points: GrammarPoint[] = [];
  const lines = section.lines;
  let buf: string[] = [];
  const flush = (block: string[]) => {
    if (block.length === 0) return;
    const header = block[0];
    const m = header.match(/^###\s+\d+\.\s*(.+)$/);
    if (!m) return;
    const headerText = m[1].trim();
    // Split on em/en dash / hyphen surrounded by spaces.
    const dashIdx = headerText.search(/\s[—–-]\s/);
    const head = dashIdx >= 0 ? headerText.slice(0, dashIdx) : headerText;
    const tail = dashIdx >= 0 ? headerText.slice(dashIdx + 3) : '';
    const pattern = head
      .trim()
      .replace(/^["'‘’“”`]+/, '')
      .replace(/["'‘’“”`]+$/, '')
      .trim();
    const meaningKo = tail.trim();
    const examples: Verse[] = [];
    let note: string | undefined;
    for (const ln of block.slice(1)) {
      const txt = ln.trim().replace(/\*\*/g, '');
      if (!txt.startsWith('- ')) continue;
      const after = txt.slice(2).trim();
      // Note lines: "부정: ... / 의문: ..."
      if (/^(부정|의문)\s*[:：]/.test(after) || after.includes('부정:') || after.includes('의문:')) {
        note = (note ? note + ' / ' : '') + after;
        continue;
      }
      // Split on first Korean char to isolate ko portion
      const koIdx = after.search(/[가-힣]/);
      if (koIdx < 0) continue;
      const ko = after.slice(koIdx).trim().replace(/[)\s]+$/, '');
      const before = after.slice(0, koIdx).trim().replace(/[(\s]+$/, '');
      // Find pinyin start (first ASCII letter or pinyin diacritic) within `before`
      const pinIdx = before.search(/[A-Za-zĀ-ǿÀ-ÿ]/);
      if (pinIdx < 0) continue;
      const zh = before.slice(0, pinIdx).trim().replace(/[\s]+$/, '');
      const pinyin = before.slice(pinIdx).trim().replace(/[(\s]+$/, '');
      if (zh && HAS_CJK.test(zh) && HAS_PINYIN.test(pinyin) && HAS_HANGUL.test(ko)) {
        examples.push({ zh, pinyin, ko });
      }
    }
    points.push({ pattern, meaningKo, examples, note });
  };
  for (const ln of lines) {
    if (ln.startsWith('### ')) {
      flush(buf);
      buf = [ln];
    } else if (buf.length > 0) {
      buf.push(ln);
    }
  }
  flush(buf);
  return points;
}

/** Bible: `### 약어 X:Y (한국어)` followed by zh / pinyin / ko */
function parseBible(section: Section | undefined): BibleQuote[] {
  if (!section) return [];
  const quotes: BibleQuote[] = [];
  const lines = section.lines;
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i].trim();
    const h = ln.match(/^###\s+(.+?)\s*\((.+)\)\s*$/);
    if (h) {
      const ref = h[1].trim();
      const refKo = h[2].trim();
      // Find next 3 non-empty lines that match verse pattern
      const after = lines.slice(i + 1).map((l) => l.trim()).filter((l) => l.length > 0);
      if (after.length >= 3 && HAS_CJK.test(after[0]) && HAS_PINYIN.test(after[1]) && HAS_HANGUL.test(after[2])) {
        quotes.push({ ref, refKo, text: { zh: cleanLine(after[0]), pinyin: cleanLine(after[1]), ko: cleanLine(after[2]) } });
      }
    }
    i += 1;
  }
  return quotes;
}

/** Dialogs: lines like `A: 中文` then pinyin, then ko (with leading spaces).
 * Parses entire section into Dialog[] grouped by role flips. */
function parseDialog(section: Section | undefined): Dialog[] {
  if (!section) return [];
  const lines = section.lines.map((l) => l.replace(/^\s+/, '')).filter((l) => l.length > 0 && !l.startsWith('>'));
  const dialogs: Dialog[] = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    const m = ln.match(/^([A-Z]|[가-힣]+(?:\([^)]*\))?)\s*[:：]\s*(.+)$/);
    if (m && HAS_CJK.test(m[2])) {
      const role = m[1].trim();
      const zh = m[2].trim();
      const pinyin = (lines[i + 1] ?? '').trim();
      const ko = (lines[i + 2] ?? '').trim();
      if (HAS_PINYIN.test(pinyin) && HAS_HANGUL.test(ko)) {
        const last = dialogs[dialogs.length - 1];
        const verse: Verse = { zh, pinyin, ko };
        if (last && last.role === role) {
          last.lines.push(verse);
        } else {
          dialogs.push({ role, lines: [verse] });
        }
        i += 3;
        continue;
      }
    }
    i += 1;
  }
  return dialogs;
}

/** Scenarios: each `### 상황 N: title` -> body markdown until next ### or ## */
function parseScenarios(section: Section | undefined): Scenario[] {
  if (!section) return [];
  const scenarios: Scenario[] = [];
  const lines = section.lines;
  let title: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (title) {
      scenarios.push({ title, body: buf.join('\n').trim() });
    }
    title = null;
    buf = [];
  };
  for (const ln of lines) {
    const h = ln.match(/^###\s+(.+)$/);
    if (h) {
      flush();
      title = h[1].trim();
    } else if (title !== null) {
      buf.push(ln);
    }
  }
  flush();
  return scenarios;
}

/** Questions: numbered list with zh / pinyin / ko triplets */
function parseQuestions(section: Section | undefined): Question[] {
  if (!section) return [];
  const raw = section.lines.map((l) => l.trim()).filter((l) => l.length > 0);
  const questions: Question[] = [];
  let i = 0;
  while (i < raw.length) {
    const ln = raw[i];
    const m = ln.match(/^\d+\.\s*(.+)$/);
    if (m && HAS_CJK.test(m[1])) {
      const zh = m[1].trim();
      const pinyin = (raw[i + 1] ?? '').trim();
      const ko = (raw[i + 2] ?? '').trim();
      if (HAS_PINYIN.test(pinyin) && HAS_HANGUL.test(ko)) {
        questions.push({ zh, pinyin, ko });
        i += 3;
        continue;
      }
    }
    i += 1;
  }
  return questions;
}

// ------------------------------ lesson assembly ------------------------------

function parseLessonFile(filePath: string, vol: 1 | 2 | 3, no: number, id: string): Lesson {
  const md = readFileSync(filePath, 'utf-8');
  const lines = md.split(/\r?\n/);
  // Title line: 第 一 课 : 01. 神的爱 Shén de ài (하나님의 사랑)
  const titleLine = lines.find((l) => /第\s*.+课\s*[:：]/.test(l)) ?? lines[0] ?? '';
  const titleMatch = titleLine.match(/[:：]\s*\d+\.\s*([^\s]+)\s+(.+?)\s*\((.+?)\)\s*$/);
  const titleZh = titleMatch?.[1] ?? '';
  const titlePinyin = titleMatch?.[2] ?? '';
  const titleKo = titleMatch?.[3] ?? '';

  const sections = splitSections(md);
  const bodySec = findSection(sections, '本文');
  const vocabSec = findSection(sections, '主要词汇');
  const pronSec = findSection(sections, '发音点');
  const grammarSec = findSection(sections, '语法点');
  const bibleSec = findSection(sections, '圣经引用');
  const dailySec = findSection(sections, '应用会话');
  const gospelSec = findSection(sections, '传福音对话');
  const scenarioSec = findSection(sections, '实战场景');
  const qSec = findSection(sections, '问题');

  return {
    id,
    vol,
    no,
    titleZh,
    titlePinyin,
    titleKo,
    body: parseVerses(bodySec?.lines ?? []),
    vocab: parseVocab(vocabSec, id),
    pronunciation: parsePronunciation(pronSec),
    grammar: parseGrammar(grammarSec),
    bible: parseBible(bibleSec),
    dialogDaily: parseDialog(dailySec),
    dialogGospel: parseDialog(gospelSec),
    scenarios: parseScenarios(scenarioSec),
    questions: parseQuestions(qSec),
  };
}

// ------------------------------ run ------------------------------

function main() {
  const allLessons: Lesson[] = [];
  for (const vol of [1, 2, 3] as const) {
    const dir = join(DOC_DIR, `vol${vol}`);
    if (!existsSync(dir)) {
      console.warn(`  vol${vol} dir not found: ${dir}`);
      continue;
    }
    const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    for (const f of files) {
      const m = f.match(/^vol(\d+)_(\d+)_/);
      if (!m) continue;
      const no = parseInt(m[2], 10);
      const id = `vol${vol}_${m[2]}`;
      const lesson = parseLessonFile(join(dir, f), vol, no, id);
      allLessons.push(lesson);
    }
  }

  // Per-volume bundles
  for (const vol of [1, 2, 3] as const) {
    const subset = allLessons.filter((l) => l.vol === vol);
    writeFileSync(join(OUT_DIR, `lessons-vol${vol}.json`), JSON.stringify(subset));
    console.log(`  lessons-vol${vol}.json  (${subset.length} lessons)`);
  }

  // Meta (titles only)
  const meta: LessonMeta[] = allLessons.map((l) => ({
    id: l.id, vol: l.vol, no: l.no, titleZh: l.titleZh, titlePinyin: l.titlePinyin, titleKo: l.titleKo,
  }));
  writeFileSync(join(OUT_DIR, 'lessons-meta.json'), JSON.stringify(meta));
  console.log(`  lessons-meta.json  (${meta.length} entries)`);

  // Appendices
  const appendices: Appendix[] = [];
  const appendixFiles = readdirSync(DOC_DIR).filter((f) => f.startsWith('附录') && f.endsWith('.md'));
  appendixFiles.sort();
  for (let i = 0; i < appendixFiles.length; i++) {
    const f = appendixFiles[i];
    const md = readFileSync(join(DOC_DIR, f), 'utf-8');
    const firstLine = md.split(/\r?\n/).find((l) => l.trim().length > 0) ?? f;
    appendices.push({
      id: `appendix${i + 1}` as Appendix['id'],
      title: firstLine.replace(/^#\s*/, '').trim(),
      markdown: md,
    });
  }
  writeFileSync(join(OUT_DIR, 'appendices.json'), JSON.stringify(appendices));
  console.log(`  appendices.json  (${appendices.length} appendices)`);

  // Stats
  const totalVerses = allLessons.reduce((s, l) => s + l.body.length, 0);
  const totalVocab = allLessons.reduce((s, l) => s + l.vocab.length, 0);
  const totalBible = allLessons.reduce((s, l) => s + l.bible.length, 0);
  console.log(`\nTotal: ${allLessons.length} lessons, ${totalVerses} body verses, ${totalVocab} vocab, ${totalBible} bible quotes`);
}

main();
