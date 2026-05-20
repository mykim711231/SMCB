/**
 * TTS 커버리지 검증 — 빌드 게이트.
 *
 * 런타임이 음성 재생을 시도하는 모든 zh 텍스트(단어·단음절 한자·예문·본문·
 * 회화·성경·시나리오·부록)가 zh-tts-manifest.json 에 등록되어 있고 실제 mp3
 * 파일이 public/tts/ 에 존재하는지 확인한다.
 *
 * 누락이 있으면 비-0 종료 → build:all 이 멈춘다. 해결: `npm run build:tts`
 * (필요하면 `-- --phase all`) 로 빠진 mp3 를 합성한 뒤 커밋.
 *
 * mp3 는 의도적으로 저장소에 커밋되는 정적 자산이므로 CI 에서 합성하지
 * 않는다 (msedge-tts 라이선스 주의 — build-tts.ts 헤더 참조). 이 스크립트는
 * "콘텐츠는 추가됐는데 음성은 빠진" 조용한 회귀만 큰 소리로 드러낸다.
 *
 * 사용:
 *   npm run verify:tts            누락 시 실패 (build:all 에 포함)
 *   npm run verify:tts -- --warn  누락을 경고만 하고 종료코드 0
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR, MANIFEST_PATH, loadLessons, collectAllTtsTexts, hashName } from './tts-texts';

function main(): void {
  const warnOnly = process.argv.slice(2).includes('--warn');

  const lessons = loadLessons();
  if (lessons.length === 0) {
    console.error('verify:tts — lessons-vol*.json 이 없습니다. 먼저 `npm run build:content` 실행.');
    process.exit(1);
  }

  const texts = collectAllTtsTexts(lessons);

  let manifest: Record<string, string> = {};
  if (existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, string>;
    } catch {
      manifest = {};
    }
  }
  const existingFiles = existsSync(OUT_DIR) ? new Set(readdirSync(OUT_DIR)) : new Set<string>();

  const missing: string[] = [];
  for (const text of texts) {
    const expected = hashName(text);
    const inManifest = manifest[text] === expected;
    const onDisk = existingFiles.has(expected);
    if (!inManifest || !onDisk) missing.push(text);
  }

  const total = texts.size;
  if (missing.length === 0) {
    console.log(`verify:tts — OK. ${total}개 zh 텍스트 모두 mp3 보유.`);
    return;
  }

  const sample = missing.slice(0, 30);
  console.error(
    `\nverify:tts — mp3 누락 ${missing.length} / ${total}개:\n` +
      sample.map((t) => `  · ${t}`).join('\n') +
      (missing.length > sample.length ? `\n  … 외 ${missing.length - sample.length}개` : '') +
      `\n\n해결: npm run build:tts -- --phase all  (합성 후 public/tts 와 manifest 커밋)\n`,
  );
  if (warnOnly) {
    console.error('verify:tts — --warn 모드: 경고만 하고 통과합니다.');
    return;
  }
  process.exit(1);
}

main();
