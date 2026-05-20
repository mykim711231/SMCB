/**
 * TTS 텍스트 수집 — build-tts.ts(합성)와 verify-tts-coverage.ts(검증)가
 * 공유하는 단일 진실 소스.
 *
 * 두 스크립트가 각자 수집 로직을 갖고 있으면 한쪽만 고쳐졌을 때 "검증은
 * 통과하는데 mp3 는 없는" 조용한 누락이 다시 생긴다. 수집 규칙은 반드시
 * 이 모듈 한 곳에만 둔다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { Lesson } from '../src/types/lesson';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = resolve(__dirname, '..');
export const DATA_DIR = join(APP_DIR, 'src', 'data');
export const OUT_DIR = join(APP_DIR, 'public', 'tts');
export const MANIFEST_PATH = join(DATA_DIR, 'zh-tts-manifest.json');

export type Phase = 1 | 2 | 3 | 'all';

// CJK Unified Ideographs — src/pages/Hanzi.tsx HAN_RE 과 동일 범위.
export const HANZI_RE = /[一-鿿]/;

export function loadLessons(): Lesson[] {
  const all: Lesson[] = [];
  for (const f of ['lessons-vol1.json', 'lessons-vol2.json', 'lessons-vol3.json']) {
    const p = join(DATA_DIR, f);
    if (!existsSync(p)) continue;
    all.push(...(JSON.parse(readFileSync(p, 'utf8')) as Lesson[]));
  }
  return all;
}

/** Extract zh from {{tts:...}} / {{verse:...}} / {{vocab:...}} placeholders in appendices.json. */
export function collectAppendixTts(): Set<string> {
  const set = new Set<string>();
  const p = join(DATA_DIR, 'appendices.json');
  if (!existsSync(p)) return set;
  const items = JSON.parse(readFileSync(p, 'utf8')) as { markdown: string }[];
  const ttsRe = /\{\{tts:([^}]+)\}\}/g;
  // {{verse:zh|pinyin|ko}} — the zh portion needs an mp3 too (VerseRow renders TTSButton).
  const verseRe = /\{\{verse:([^|}]+)\|[^|}]+\|[^}]+\}\}/g;
  // {{vocab:...}} — word needs an mp3; 8-field form also has example.zh that needs one.
  const vocabRe = /\{\{vocab:([^}]+)\}\}/g;
  for (const it of items) {
    const md = it.markdown ?? '';
    let m;
    while ((m = ttsRe.exec(md)) !== null) set.add(m[1].trim());
    while ((m = verseRe.exec(md)) !== null) set.add(m[1].trim());
    while ((m = vocabRe.exec(md)) !== null) {
      const parts = m[1].split('|').map((s) => s.trim());
      if (parts[0]) set.add(parts[0]);            // word
      if (parts.length >= 8 && parts[5]) set.add(parts[5]); // example.zh
    }
  }
  set.delete('');
  return set;
}

export function collectZh(lessons: Lesson[], phase: Phase): Set<string> {
  const set = new Set<string>();
  const want = (n: number): boolean => phase === 'all' || phase === n;

  for (const l of lessons) {
    if (want(1)) {
      for (const v of l.vocab ?? []) {
        if (!v.word) continue;
        const w = v.word.trim();
        set.add(w);
        // 한자 인덱스 페이지(/hanzi)는 단어를 한 글자씩 분해해 발음을 들려준다.
        // 단음절 한자도 mp3가 있어야 오프라인 재생이 된다.
        for (const ch of w) {
          if (HANZI_RE.test(ch)) set.add(ch);
        }
      }
    }
    if (want(2)) {
      for (const v of l.vocab ?? []) {
        if (v.example?.zh) set.add(v.example.zh.trim());
      }
    }
    if (want(3)) {
      if (l.titleZh) set.add(l.titleZh.trim());
      for (const b of l.body ?? []) if (b.zh) set.add(b.zh.trim());
      for (const p of l.pronunciation ?? []) if (p.hanzi) set.add(p.hanzi.trim());
      for (const g of l.grammar ?? []) {
        for (const e of g.examples ?? []) if (e.zh) set.add(e.zh.trim());
      }
      for (const b of l.bible ?? []) if (b.text?.zh) set.add(b.text.zh.trim());
      for (const d of l.dialogDaily ?? []) {
        for (const ln of d.lines ?? []) if (ln.zh) set.add(ln.zh.trim());
      }
      for (const d of l.dialogGospel ?? []) {
        for (const ln of d.lines ?? []) if (ln.zh) set.add(ln.zh.trim());
      }
      for (const q of l.questions ?? []) if (q.zh) set.add(q.zh.trim());
      for (const sc of l.scenarios ?? []) {
        for (const seg of sc.segments ?? []) {
          if (seg.kind === 'verse' && seg.verse.zh) set.add(seg.verse.zh.trim());
        }
      }
    }
  }
  set.delete('');
  return set;
}

/**
 * 런타임이 음성 재생을 시도할 수 있는 모든 zh 텍스트 = phase all + 부록 플레이스홀더.
 * verify-tts-coverage.ts 의 검증 기준.
 */
export function collectAllTtsTexts(lessons: Lesson[]): Set<string> {
  const set = collectZh(lessons, 'all');
  for (const t of collectAppendixTts()) set.add(t);
  set.delete('');
  return set;
}

export function hashName(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 12) + '.mp3';
}
