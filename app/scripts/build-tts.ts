/**
 * Phased TTS asset builder — Microsoft Edge Read-Aloud (Neural) 백엔드.
 *
 * 입력:
 *   - src/data/lessons-vol{1,2,3}.json (build:content가 생성)
 *
 * 출력:
 *   - public/tts/<sha1-12>.mp3   (실제 음성 파일)
 *   - src/data/zh-tts-manifest.json  (원문 zh → 파일명 매핑)
 *
 * 백엔드: msedge-tts
 *   - Edge의 Read-Aloud Neural TTS (Azure Speech와 동일 모델 계열)를 무료·무인증 호출
 *   - 빌드타임 1회 합성 후 mp3 정적 파일로 배포 → 런타임 외부 의존 0
 *   - 음성 예: zh-CN-XiaoxiaoNeural (여), zh-CN-YunyiMultilingualNeural (남, 다국어),
 *     zh-CN-YunxiNeural (남), zh-CN-XiaoyiNeural (여, 어린이)
 *
 * Idempotent: 이미 합성된 파일이 있으면 skip.
 *
 * Phase:
 *   1 (default): vocab.word — 단어 카드용. 가장 자주 호출되므로 우선.
 *   2: vocab.example.zh — 예문 발음.
 *   3: body / dialog / bible — 본문·회화·성경.
 *   all: 위 모두.
 *
 * 사용 예:
 *   npm run build:tts -- --voice zh-CN-XiaoxiaoNeural --phase 1
 *   npm run build:tts -- --phase all --voice zh-CN-XiaoxiaoNeural
 *   npm run build:tts -- --phase 1 --limit 20 --dry-run
 *
 * Note: msedge-tts는 ESM/CJS 둘 다 export. import만 하고 setMetadata로 음성 지정.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, createWriteStream } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { Lesson } from '../src/types/lesson';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..');
const DATA_DIR = join(APP_DIR, 'src', 'data');
const OUT_DIR = join(APP_DIR, 'public', 'tts');
const MANIFEST_PATH = join(DATA_DIR, 'zh-tts-manifest.json');

const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';

type Phase = 1 | 2 | 3 | 'all';

type Args = {
  voice: string;
  phase: Phase;
  limit: number | null;
  dryRun: boolean;
  concurrency: number;
};

function parseArgs(): Args {
  const out: Args = {
    voice: DEFAULT_VOICE,
    phase: 1,
    limit: null,
    dryRun: false,
    concurrency: 4,
  };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--voice') out.voice = a[++i] ?? DEFAULT_VOICE;
    else if (k === '--phase') {
      const v = a[++i];
      out.phase = v === 'all' ? 'all' : (Number(v) as Phase);
    } else if (k === '--limit') out.limit = Number(a[++i]);
    else if (k === '--dry-run') out.dryRun = true;
    else if (k === '--concurrency') out.concurrency = Math.max(1, Number(a[++i]) || 1);
  }
  return out;
}

function loadLessons(): Lesson[] {
  const all: Lesson[] = [];
  for (const f of ['lessons-vol1.json', 'lessons-vol2.json', 'lessons-vol3.json']) {
    const p = join(DATA_DIR, f);
    if (!existsSync(p)) continue;
    all.push(...(JSON.parse(readFileSync(p, 'utf8')) as Lesson[]));
  }
  return all;
}

function collectZh(lessons: Lesson[], phase: Phase): Set<string> {
  const set = new Set<string>();
  const want = (n: number): boolean => phase === 'all' || phase === n;

  for (const l of lessons) {
    if (want(1)) {
      for (const v of l.vocab ?? []) {
        if (v.word) set.add(v.word.trim());
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
    }
  }
  set.delete('');
  return set;
}

function hashName(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 12) + '.mp3';
}

/**
 * 단일 텍스트를 합성하여 path에 mp3로 저장.
 * msedge-tts API: toStream() → { audioStream(Readable) }. Readable을 file로 pipe.
 */
async function synthesizeOne(tts: MsEdgeTTS, text: string, path: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const out = createWriteStream(path);
    const { audioStream } = tts.toStream(text);
    audioStream.on('error', reject);
    out.on('error', reject);
    out.on('finish', () => resolve());
    audioStream.pipe(out);
  });
}

/**
 * 동시성 풀: items를 concurrency개씩 병렬 합성.
 * 각 워커는 자체 MsEdgeTTS 인스턴스(WebSocket)를 가져 직렬 처리.
 */
async function synthesizeAll(
  todo: { text: string; path: string; file: string }[],
  voice: string,
  concurrency: number,
  manifest: Record<string, string>,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  let cursor = 0;
  let done = 0;
  const total = todo.length;

  async function worker(): Promise<void> {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    while (true) {
      const i = cursor++;
      if (i >= total) break;
      const it = todo[i];
      try {
        await synthesizeOne(tts, it.text, it.path);
        manifest[it.text] = it.file;
        done++;
        onProgress(done, total);
        // 매 10개마다 중간 저장
        if (done % 10 === 0) {
          writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, Object.keys(manifest).sort(), 2));
        }
      } catch (e) {
        console.error(`\n  FAIL [${it.text}]:`, (e as Error).message);
      }
    }
    try {
      tts.close();
    } catch {
      /* ignore */
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const lessons = loadLessons();
  if (lessons.length === 0) {
    console.error('No lessons found in', DATA_DIR, '— run `npm run build:content` first.');
    process.exit(1);
  }

  console.log(`Voice: ${args.voice}`);
  const texts = Array.from(collectZh(lessons, args.phase));
  const targets = args.limit ? texts.slice(0, args.limit) : texts;
  console.log(
    `Phase ${args.phase}: ${texts.length} unique zh texts${
      args.limit ? ` (limited to ${targets.length})` : ''
    }`,
  );

  let manifest: Record<string, string> = {};
  if (existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, string>;
    } catch {
      manifest = {};
    }
  }

  const todo: { text: string; path: string; file: string }[] = [];
  const existingFiles = new Set(readdirSync(OUT_DIR));
  for (const t of targets) {
    const file = hashName(t);
    const full = join(OUT_DIR, file);
    if (manifest[t] === file && existingFiles.has(file)) continue;
    todo.push({ text: t, path: full, file });
  }
  console.log(`To synthesize: ${todo.length} (skipped ${targets.length - todo.length} cached)`);
  if (args.dryRun) {
    console.log('--dry-run: no synthesis performed.');
    return;
  }
  if (todo.length === 0) return;

  const t0 = Date.now();
  await synthesizeAll(todo, args.voice, args.concurrency, manifest, (done, total) => {
    if (done % 5 === 0 || done === total) {
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`\r  [${done}/${total}] ${sec}s   `);
    }
  });
  // 최종 저장
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, Object.keys(manifest).sort(), 2));
  console.log(`\nDone. manifest has ${Object.keys(manifest).length} entries.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
