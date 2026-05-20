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
  ScenarioSegment,
  Question,
  Appendix,
} from '../src/types/lesson.ts';
import { tokenizeChinese } from '../src/lib/zh-tokenize';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const DOC_DIR = join(ROOT, 'Doc', 'Markdown');
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

/**
 * Vocab 헤더 파서.
 *
 * 표준 형식: `word  /  pinyin  /  [pos]  /  meaning`
 *   - pos 토큰 `[...]` 내부에 슬래시가 들어가는 경우가 빈번하므로
 *     (예: `[동사/명사 (v./n.)]`) 먼저 마스킹 후 split.
 *   - meaning 내부의 슬래시(예: `사랑하다 / 사랑`)는 part 4 이후를 join하여 복원.
 *
 * 슬래시-없는 형식: `한자(부가) 병음(부가) (한국어뜻)`
 *   - 예: `赐(给) cì(gěi) (베풀어 주다)`
 *   - pos는 본문 `- 품사: ...` 라인에서 별도 추출 (caller에서 처리).
 */
function parseVocabHeader(
  headerText: string,
): { word: string; pinyin: string; pos: string; meaning: string } | null {
  // 1) pos `[...]` 토큰 보호 마스킹
  const PH = 'POS';
  let masked = headerText;
  let bracketPos = '';
  const br = headerText.match(/\[[^\]]*\]/);
  if (br) {
    bracketPos = br[0];
    masked = headerText.replace(br[0], PH);
  }
  // 2) 슬래시 분리: bracket 토큰 `[...]`의 위치를 기준으로 pos를 잡고
  //    그 앞은 word/pinyin(+추가 발음), 그 뒤는 meaning으로 분리.
  //    이 규칙은 슬래시가 4파트(예: pos 안 슬래시)/5파트 이상(예: pinyin 옆 부가 발음
  //    `舍 shě`가 끼어든 케이스)에도 동일하게 동작.
  if (masked.includes('/')) {
    const parts = masked.split('/').map((s) => s.trim());
    const posIdx = parts.findIndex((p) => p === PH);
    if (posIdx >= 0) {
      const word = parts[0] ?? '';
      // posIdx 이전 part(들)을 pinyin으로 합침 (부가 발음 표기 보존)
      const pinyin = parts.slice(1, Math.max(1, posIdx)).join(' / ').trim();
      const meaning = parts
        .slice(posIdx + 1)
        .join(' / ')
        .replace(PH, bracketPos)
        .trim();
      return { word, pinyin, pos: bracketPos, meaning };
    }
    // bracket이 아예 없는 경우: 표준 4파트로 가정
    if (parts.length >= 2) {
      const word = parts[0] ?? '';
      const pinyin = parts[1] ?? '';
      const posPart = (parts[2] ?? '').trim();
      const meaning = parts.slice(3).join(' / ').trim();
      return { word, pinyin, pos: posPart, meaning };
    }
  }
  // 3) 슬래시 없는 형식: `한자(부가) 병음(부가) (한국어뜻)`
  //    한자 토큰: 한자/괄호 포함, 공백 없음
  //    병음 토큰: 알파벳/성조/괄호 포함, 공백 없음
  //    한국어 뜻: 마지막 (...) 안에
  const m = headerText.match(
    /^([一-鿿(][一-鿿()]*)\s+([A-Za-zĀ-ǿÀ-ÿ()]+)\s*\(([^)]+)\)\s*$/,
  );
  if (m) {
    return { word: m[1].trim(), pinyin: m[2].trim(), pos: '', meaning: m[3].trim() };
  }
  return null;
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
    const parsed = parseVocabHeader(m[1].trim());
    if (!parsed) return;
    const entry: VocabEntry = {
      id: `${lessonId}_v${idx}`,
      word: parsed.word,
      pinyin: parsed.pinyin,
      pos: parsed.pos,
      meaning: parsed.meaning,
    };
    // pos가 비어있고 본문에 `- 품사: ...` 라인이 있으면 보충 (슬래시 없는 헤더 형식 대응)
    if (!entry.pos) {
      const posLine = block.find((l) => /^[-\s]*품사\s*[:：]/.test(l));
      if (posLine) entry.pos = posLine.replace(/^[-\s]*품사\s*[:：]\s*/, '').trim();
    }
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
      // 메타 노트 가드: 정상 zh는 괄호를 포함하지 않는다.
      // 예: `- 当 (dāng) 으로도 대체 가능` 같은 어법 메모는 verse가 아니라 note로 분류.
      if (/[()（）"'"']/.test(zh)) {
        note = (note ? note + ' / ' : '') + after;
        continue;
      }
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

/**
 * Scenarios — `### 상황 N: title` 하위에 verse trio(zh/pinyin/ko)와
 * 자유 텍스트가 섞여 있다. trio는 VerseRow + TTS 가능하도록 segments에 verse로,
 * 나머지는 text segment로 분리한다.
 *
 * 줄 형식:
 *   - `A: 我对象...` / `- Q: 这些事...` 처럼 라벨이 zh 라인 앞에 붙는 경우가 있어
 *     LABEL_RE로 라벨을 분리하고 prefix로 보존.
 *   - 들여쓰기·trailing-two-space(markdown linebreak)는 무시.
 */
const SCENARIO_LABEL_RE = /^(?:-\s*)?([A-Z])\s*[:：]\s*(.*)$/;

function parseScenarioSegments(lines: string[]): ScenarioSegment[] {
  const raw = lines.map((l) => l.replace(/\s+$/, '').trim());
  const segs: ScenarioSegment[] = [];
  let i = 0;
  while (i < raw.length) {
    const a = raw[i];
    if (!a) {
      i += 1;
      continue;
    }
    const m = a.match(SCENARIO_LABEL_RE);
    const aZh = m ? m[2].trim() : a;
    const prefix = m ? `${m[1]}:` : undefined;
    const b = raw[i + 1] ?? '';
    const c = raw[i + 2] ?? '';
    if (HAS_CJK.test(aZh) && HAS_PINYIN.test(b) && HAS_HANGUL.test(c)) {
      segs.push({
        kind: 'verse',
        verse: { zh: cleanLine(aZh), pinyin: cleanLine(b), ko: cleanLine(c) },
        prefix,
      });
      i += 3;
      continue;
    }
    segs.push({ kind: 'text', text: a });
    i += 1;
  }
  return segs;
}

function parseScenarios(section: Section | undefined): Scenario[] {
  if (!section) return [];
  const scenarios: Scenario[] = [];
  const lines = section.lines;
  let title: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (title) {
      scenarios.push({ title, segments: parseScenarioSegments(buf) });
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

/**
 * 부록(특히 부록1) 표에서 VocabEntry를 추출.
 *
 * 부록1 표는 섹션마다 컬럼이 다르다:
 *   - 1~5: `중국어 | 병음 | 음성 | 한국어 | 사용 맥락` 또는 `... | 비고`
 *   - 6:   `중국어 | 병음 | 음성 | 한국어`
 *   - 7:   `중국어 | 음성 | 한국어` (병음 없음)
 *   - 8:   `개신교 | 음성 | 천주교 | 음성 | 한국어` — 좌·우 단어 모두 1~4에 이미
 *          나오므로 중복 방지 차원에서 스킵.
 *
 * 처리: 헤더 행에서 컬럼 인덱스를 동적 매핑. 음성 컬럼(TTS 마크업)은 무시.
 * 합성 단어(예: `信徒 / 基督徒`)는 첫 토큰만 word로 채택 — TTS와 SRS가 단일
 * 한자열을 가정하기 때문.
 */
function parseAppendixVocab(markdown: string, appendixId: string): VocabEntry[] {
  const sections = splitSections(markdown);
  const out: VocabEntry[] = [];
  let idx = 0;
  const splitRow = (line: string): string[] =>
    line.split('|').slice(1, -1).map((c) => c.trim());
  for (const sec of sections) {
    if (/개신교\s*vs/i.test(sec.heading)) continue; // 8번 섹션 — 중복
    const tableLines = sec.lines.filter((l) => l.trim().startsWith('|'));
    if (tableLines.length < 2) continue;
    const headerCells = splitRow(tableLines[0]);
    const zhCol = headerCells.findIndex((c) => /중국어/.test(c));
    const pyCol = headerCells.findIndex((c) => /병음/.test(c));
    const koCol = headerCells.findIndex((c) => /한국어/.test(c));
    const noteCol = headerCells.findIndex((c) => /사용 맥락|비고/.test(c));
    if (zhCol < 0 || koCol < 0) continue;
    for (let r = 1; r < tableLines.length; r++) {
      const cells = splitRow(tableLines[r]);
      if (cells.length === 0) continue;
      if (cells.every((c) => /^[-:\s]+$/.test(c))) continue; // 구분선
      const wordRaw = cells[zhCol] ?? '';
      const koRaw = cells[koCol] ?? '';
      if (!wordRaw || !koRaw) continue;
      const pyRaw = pyCol >= 0 ? (cells[pyCol] ?? '') : '';
      const noteRaw = noteCol >= 0 ? (cells[noteCol] ?? '') : '';
      const word = wordRaw.split(/[/／]/)[0].trim();
      const pinyin = pyRaw.split(/[/／]/)[0].trim();
      if (!word || !HAS_CJK.test(word)) continue;
      const entry: VocabEntry = {
        id: `${appendixId}_v${idx}`,
        word,
        pinyin,
        pos: '',
        meaning: koRaw.replace(/\*\*/g, '').trim(),
      };
      if (noteRaw) entry.hanjaNote = noteRaw;
      out.push(entry);
      idx += 1;
    }
  }
  return out;
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

  // Appendices + Pronunciation (same data model, unified JSON file)
  const appendices: Appendix[] = [];

  const extractTitleAndBody = (md: string, fallback: string): { title: string; body: string } => {
    const lines = md.split(/\r?\n/);
    const firstIdx = lines.findIndex((l) => l.trim().length > 0);
    if (firstIdx === -1) return { title: fallback, body: md };
    const firstLine = lines[firstIdx];
    const title = firstLine.replace(/^#\s*/, '').trim();
    const body = [...lines.slice(0, firstIdx), ...lines.slice(firstIdx + 1)].join('\n').replace(/^\s+/, '');
    return { title, body };
  };

  // 1) Pronunciation: 发音*.md  (listed first so they appear before 附录 in the UI)
  const pronFiles = readdirSync(DOC_DIR).filter((f) => f.startsWith('发音') && f.endsWith('.md'));
  pronFiles.sort();
  for (let i = 0; i < pronFiles.length; i++) {
    const f = pronFiles[i];
    const md = readFileSync(join(DOC_DIR, f), 'utf-8');
    const { title, body } = extractTitleAndBody(md, f);
    appendices.push({
      id: `pronunciation${i + 1}`,
      category: 'pronunciation',
      title,
      markdown: body,
    });
  }

  // 2) Appendices: 附录*.md
  const appendixFiles = readdirSync(DOC_DIR).filter((f) => f.startsWith('附录') && f.endsWith('.md'));
  appendixFiles.sort();
  for (let i = 0; i < appendixFiles.length; i++) {
    const f = appendixFiles[i];
    const md = readFileSync(join(DOC_DIR, f), 'utf-8');
    const { title, body } = extractTitleAndBody(md, f);
    const id = `appendix${i + 1}`;
    const appendix: Appendix = { id, category: 'appendix', title, markdown: body };
    // 부록1만 표 파싱 → 학습용 vocab. 다른 부록은 설명 위주라 표 행이 단어 단위가 아님.
    if (/附录1_/.test(f)) {
      const vocab = parseAppendixVocab(md, id);
      if (vocab.length > 0) appendix.vocab = vocab;
    }
    appendices.push(appendix);
  }

  writeFileSync(join(OUT_DIR, 'appendices.json'), JSON.stringify(appendices));
  const totalAppendixVocab = appendices.reduce((s, a) => s + (a.vocab?.length ?? 0), 0);
  console.log(`  appendices.json  (${appendices.length} items: ${pronFiles.length} pronunciation + ${appendixFiles.length} appendix, ${totalAppendixVocab} appendix vocab)`);

  // 중국어 토큰 매니페스트 — 빌드타임에 모든 zh 문자열을 토큰화하여 저장.
  // Why: 런타임의 Intl.Segmenter('zh','word')는 브라우저 ICU 버전에 따라 결과가
  //   달라져 같은 문장이 다른 토큰 시퀀스로 분할될 수 있다. 빌드 환경(Node)에서
  //   사전계산해두면 모든 사용자가 동일한 토큰을 본다.
  // 수집 대상: 게임/검색에 사용 가능한 모든 zh 원천.
  //   - body, vocab.word, vocab.example.zh, pronunciation.hanzi
  //   - grammar.examples.zh, bible.text.zh
  //   - dialogDaily/Gospel.lines.zh, questions.zh
  const zhSet = new Set<string>();
  const addZh = (s: string | undefined | null): void => {
    if (!s) return;
    const t = s.trim();
    if (!t) return;
    zhSet.add(t);
  };
  for (const l of allLessons) {
    addZh(l.titleZh);
    for (const v of l.body) addZh(v.zh);
    for (const v of l.vocab) {
      addZh(v.word);
      if (v.example) addZh(v.example.zh);
    }
    for (const p of l.pronunciation) addZh(p.hanzi);
    for (const g of l.grammar) for (const e of g.examples) addZh(e.zh);
    for (const b of l.bible) addZh(b.text.zh);
    for (const d of l.dialogDaily) for (const ln of d.lines) addZh(ln.zh);
    for (const d of l.dialogGospel) for (const ln of d.lines) addZh(ln.zh);
    for (const q of l.questions) addZh(q.zh);
    // 실전 시나리오의 verse trio도 sentence-builder 출제 대상이 되므로 토큰 매니페스트에 포함.
    for (const s of l.scenarios) {
      for (const seg of s.segments) {
        if (seg.kind === 'verse') addZh(seg.verse.zh);
      }
    }
  }
  // 부록 vocab의 word도 한자 토큰 매니페스트에 포함 — Flashcards/Quiz의 zh 토크나이저가 필요.
  for (const a of appendices) {
    if (!a.vocab) continue;
    for (const v of a.vocab) addZh(v.word);
  }
  const tokenManifest: Record<string, string[]> = {};
  for (const zh of zhSet) {
    const tokens = tokenizeChinese(zh);
    if (tokens.length > 0) tokenManifest[zh] = tokens;
  }
  writeFileSync(join(OUT_DIR, 'zh-tokens.json'), JSON.stringify(tokenManifest));
  console.log(`  zh-tokens.json  (${Object.keys(tokenManifest).length} entries)`);

  // Stats
  const totalVerses = allLessons.reduce((s, l) => s + l.body.length, 0);
  const totalVocab = allLessons.reduce((s, l) => s + l.vocab.length, 0);
  const totalBible = allLessons.reduce((s, l) => s + l.bible.length, 0);
  console.log(`\nTotal: ${allLessons.length} lessons, ${totalVerses} body verses, ${totalVocab} vocab, ${totalBible} bible quotes`);
}

main();
