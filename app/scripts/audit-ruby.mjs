/**
 * 글자별 병음(per-character ruby) 정렬 실패 전수 조사.
 *
 * src/lib/pinyinRuby.ts 의 alignRuby 와 동일한 로직으로 모든 zh/pinyin 쌍을
 * 검사하여, 한자 수 ≠ 병음 음절 수 로 정렬에 실패하는 항목을 모두 출력한다.
 *
 *   실행:  node scripts/audit-ruby.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data');
const load = (f) => JSON.parse(readFileSync(resolve(DATA, f), 'utf-8'));

// ── pinyinRuby.ts 와 동일한 정규식/로직 (회귀 검증용 복제) ───────────────────
const CJK_RE = /[㐀-䶿一-鿿]/;
const VOWELS =
  'aeiouüvAEIOUÜVāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ';
const SYL_RE = new RegExp(
  '(?:[bpmfdtnlgkhjqxrzcsywBPMFDTNLGKHJQXRZCSYW]h?)?' +
    `[${VOWELS}]+` +
    `(?:(?:ng|n|NG|N)(?![${VOWELS}]))?` +
    `(?:[rR](?![${VOWELS}]))?`,
  'g',
);
const ERHUA_CHAR_RE = /^[儿兒]$/;

function tokenizeSyllables(pinyin) {
  if (!pinyin) return [];
  return Array.from(pinyin.matchAll(SYL_RE)).map((m) => m[0]);
}

/** alignRuby 와 동일 — 실패 시 사유 객체 반환, 성공 시 null */
function checkAlign(zh, pinyin) {
  if (!zh || !pinyin) return { reason: '빈 zh/pinyin' };
  const syllables = tokenizeSyllables(pinyin);
  const chars = Array.from(zh);
  const hanziCount = chars.reduce((n, c) => (CJK_RE.test(c) ? n + 1 : n), 0);
  if (hanziCount === 0) return { reason: '한자 0개' };
  const deficit = hanziCount - syllables.length;
  if (deficit < 0) {
    return { reason: `병음 ${syllables.length}음절 > 한자 ${hanziCount}자`, syl: syllables };
  }
  let erhuaLeft = deficit;
  let i = 0;
  for (const c of chars) {
    if (!CJK_RE.test(c)) continue;
    if (erhuaLeft > 0 && ERHUA_CHAR_RE.test(c) && i > 0 && /[rR]$/.test(syllables[i - 1] ?? '')) {
      erhuaLeft -= 1;
      continue;
    }
    if (i >= syllables.length) return { reason: '음절 부족', syl: syllables };
    i += 1;
  }
  if (i !== syllables.length || erhuaLeft !== 0) {
    return {
      reason: `한자 ${hanziCount}자 ≠ 병음 ${syllables.length}음절 (儿화 미설명 ${erhuaLeft})`,
      hanziCount,
      syl: syllables,
    };
  }
  return null;
}

// ── 모든 zh/pinyin 쌍 수집 ──────────────────────────────────────────────────
const pairs = []; // { loc, zh, pinyin }
const addVerse = (loc, v) => {
  if (v && (v.zh || v.pinyin)) pairs.push({ loc, zh: v.zh ?? '', pinyin: v.pinyin ?? '' });
};

for (const vol of [1, 2, 3]) {
  const lessons = load(`lessons-vol${vol}.json`);
  for (const l of lessons) {
    const id = l.id;
    addVerse(`${id} · 제목`, { zh: l.titleZh, pinyin: l.titlePinyin });
    (l.body ?? []).forEach((v, i) => addVerse(`${id} · 본문[${i}]`, v));
    (l.vocab ?? []).forEach((vo, i) => {
      addVerse(`${id} · 단어[${i}] ${vo.word}`, { zh: vo.word, pinyin: vo.pinyin });
      if (vo.example) addVerse(`${id} · 단어[${i}] ${vo.word} 예문`, vo.example);
    });
    (l.pronunciation ?? []).forEach((p, i) =>
      addVerse(`${id} · 발음[${i}]`, { zh: p.hanzi, pinyin: p.pinyin }),
    );
    (l.grammar ?? []).forEach((g, gi) =>
      (g.examples ?? []).forEach((v, i) => addVerse(`${id} · 문법[${gi}].예문[${i}]`, v)),
    );
    (l.bible ?? []).forEach((b, i) => addVerse(`${id} · 성경[${i}] ${b.ref}`, b.text));
    (l.dialogDaily ?? []).forEach((d, di) =>
      (d.lines ?? []).forEach((v, i) => addVerse(`${id} · 일상대화[${di}].줄[${i}]`, v)),
    );
    (l.dialogGospel ?? []).forEach((d, di) =>
      (d.lines ?? []).forEach((v, i) => addVerse(`${id} · 복음대화[${di}].줄[${i}]`, v)),
    );
    (l.scenarios ?? []).forEach((s, si) =>
      (s.segments ?? []).forEach((seg, i) => {
        if (seg.kind === 'verse') addVerse(`${id} · 시나리오[${si}].segment[${i}]`, seg.verse);
      }),
    );
    (l.questions ?? []).forEach((v, i) => addVerse(`${id} · 질문[${i}]`, v));
  }
}

// 부록 vocab
try {
  const apps = load('appendices.json');
  for (const a of apps) {
    (a.vocab ?? []).forEach((vo, i) => {
      addVerse(`${a.id} · 단어[${i}] ${vo.word}`, { zh: vo.word, pinyin: vo.pinyin });
      if (vo.example) addVerse(`${a.id} · 단어[${i}] ${vo.word} 예문`, vo.example);
    });
  }
} catch { /* appendices 없음 */ }

// ── 검사 ────────────────────────────────────────────────────────────────────
const fails = [];
for (const p of pairs) {
  const r = checkAlign(p.zh, p.pinyin);
  if (r) fails.push({ ...p, ...r });
}

// 발음 표(pronunciation)는 hanzi 칸에 여러 글자/설명이 들어가 정렬 대상이 아님 →
// 제외하지 않고 그대로 보여주되 구분만 한다. 사용처(VerseRow/Marathon) 기준
// 실제 영향 항목과 참고 항목을 나눠 출력.
const real = fails.filter((f) => !f.loc.includes('· 발음['));
const pron = fails.filter((f) => f.loc.includes('· 발음['));

console.log(`\n총 검사 대상 zh/pinyin 쌍: ${pairs.length}개`);
console.log(`정렬 실패: ${fails.length}개  (영향 ${real.length} / 발음표 ${pron.length})\n`);

const dump = (title, list) => {
  if (!list.length) return;
  console.log(`\n══ ${title} (${list.length}) ══`);
  for (const f of list) {
    console.log(`\n[${f.loc}]  ${f.reason}`);
    console.log(`  zh    : ${f.zh}`);
    console.log(`  pinyin: ${f.pinyin}`);
    if (f.syl) console.log(`  음절  : ${f.syl.join(' / ')}`);
  }
};

dump('영향 항목 (VerseRow / 플래시카드에서 글자별 병음 안 됨)', real);
dump('참고: 발음표 항목 (원래 정렬 대상 아님)', pron);
console.log('');
