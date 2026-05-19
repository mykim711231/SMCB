/**
 * 중국어 토큰화 — sentence-builder 퀴즈/4지선다 distractor/대조쌍 등에서 공통 사용.
 *
 * sentence-builder.ts에서 분리된 이유:
 *   - 빌드 스크립트(scripts/build-content.ts)가 매니페스트 사전계산을 위해 import해야 하는데,
 *     sentence-builder는 @/types/lesson 등 path alias에 의존하지 않는 형태로 분리해
 *     tsx로 직접 실행 가능.
 *   - runtime은 sentence-builder.ts에서 re-export로 호환성 유지.
 *
 * 매니페스트 인덱싱 — runtime은 외부에서 setTokenManifest(map)로 사전계산 결과를 주입.
 *   - 매니페스트는 zh(트림 후) → tokens[] 매핑
 *   - hit이면 Intl.Segmenter 호출 없이 즉시 반환 (브라우저 ICU 버전 차이 회피)
 *   - miss면 기존 fallback 경로 (Intl.Segmenter → 1글자 분할 → 강제 묶음)
 */

// Intl.Segmenter — TS lib에 누락된 경우를 위한 최소 선언.
type SegmenterCtor = new (
  locale?: string,
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
) => { segment: (input: string) => Iterable<{ segment: string }> };

// 채점 정규화에서 제거할 문자:
//   - \s: 공백류
//   - 　: 전각 공백
//   - ​-‍, ﻿: ZWSP/ZWNJ/ZWJ/BOM (보이지 않는 텍스트 단편으로 채점 어긋남 방지)
//   - 중/일/한 구두점 + 영문 구두점 + 따옴표·괄호·대시
//   - 가-힣: 한글 음절 — 정답 데이터에 한글 병기("我爱你 사랑해")가 혼입되어도
//     비교가 한자 부분만으로 이뤄지도록.
export const PUNCT_RE = /[\s　​-‍﻿。，、；：！？「」『』（）〈〉《》【】"'"'·．，！？；：（）.,!?;:()[\]{}<>—–\-가-힣]/g;

export function normalizeForCompare(s: string): string {
  return s.replace(PUNCT_RE, '');
}

/**
 * 강제 묶음 사전 — Intl.Segmenter('zh','word')가 짝없이 쪼개는 종교·고유명사를
 * 통째로 한 토큰으로 묶기 위한 보정 사전.
 * 자세한 설계 의도는 applyForcedJoins 위 주석 참고.
 */
export const FORCED_JOINS: ReadonlyArray<string> = [
  '耶稣基督', '耶稣', '基督',
  '上帝', '天主', '神',
  '圣灵', '圣经', '圣父', '圣子', '天父', '天堂', '天国', '天使',
  '救主', '救世主', '救赎', '救恩',
  '弥赛亚', '福音', '真理', '信仰', '罪人',
  '教会', '使徒', '先知', '门徒',
  '中文', '韩国', '北京', '上海',
  '马太福音', '马可福音', '路加福音', '约翰福音',
  '马太', '马可', '路加', '约翰',
];

// 긴 항목부터 정렬 — "耶稣"가 "耶稣基督"의 일부로 먼저 묶이는 것을 막기 위해.
const FORCED_JOINS_SORTED = FORCED_JOINS.slice().sort((a, b) => b.length - a.length);

export function applyForcedJoins(tokens: string[]): string[] {
  if (tokens.length < 2) return tokens;
  const text = tokens.join('');
  const starts: number[] = [];
  let acc = 0;
  for (const t of tokens) { starts.push(acc); acc += t.length; }
  const groupOf: number[] = tokens.map((_, i) => i);

  for (const phrase of FORCED_JOINS_SORTED) {
    let pos = 0;
    while (pos <= text.length - phrase.length) {
      const hit = text.indexOf(phrase, pos);
      if (hit < 0) break;
      const startIdx = starts.indexOf(hit);
      if (startIdx >= 0) {
        let endIdx = startIdx;
        let accLen = tokens[startIdx].length;
        while (accLen < phrase.length && endIdx + 1 < tokens.length) {
          endIdx++;
          accLen += tokens[endIdx].length;
        }
        if (accLen === phrase.length) {
          for (let i = startIdx; i <= endIdx; i++) groupOf[i] = startIdx;
        }
      }
      pos = hit + 1;
    }
  }

  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const g = groupOf[i];
    let j = i;
    while (j + 1 < tokens.length && groupOf[j + 1] === g) j++;
    out.push(tokens.slice(i, j + 1).join(''));
    i = j + 1;
  }
  return out;
}

// 사전계산 매니페스트 (runtime 캐시) — 외부에서 setTokenManifest로 주입.
let TOKEN_MANIFEST: Readonly<Record<string, ReadonlyArray<string>>> = {};

export function setTokenManifest(m: Record<string, ReadonlyArray<string>>): void {
  TOKEN_MANIFEST = m;
}

/**
 * 중국어 문장을 단어 단위 토큰으로 분할.
 * 우선순위:
 *   1) TOKEN_MANIFEST hit (빌드타임 사전계산) → 즉시 반환
 *   2) Intl.Segmenter('zh','word')
 *   3) 한 글자 분할 fallback
 * 마지막으로 FORCED_JOINS 사전으로 종교·고유명사 묶음.
 */
export function tokenizeChinese(zh: string): string[] {
  const text = (zh ?? '').trim();
  if (!text) return [];
  // 1) 매니페스트 hit (이미 forced-joins 적용된 결과)
  const cached = TOKEN_MANIFEST[text];
  if (cached && cached.length > 0) return cached.slice();

  let tokens: string[] = [];
  const SegCtor = (typeof Intl !== 'undefined'
    ? ((Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter)
    : undefined);
  if (typeof SegCtor === 'function') {
    try {
      const seg = new SegCtor('zh', { granularity: 'word' });
      for (const part of seg.segment(text)) {
        const v = (part.segment ?? '').trim();
        if (!v) continue;
        tokens.push(v);
      }
    } catch {
      tokens = [];
    }
  }
  if (tokens.length <= 1) {
    tokens = Array.from(text).map((c) => c.trim()).filter((c) => c.length > 0);
  }
  tokens = tokens.filter((t) => normalizeForCompare(t).length > 0);
  return applyForcedJoins(tokens);
}
