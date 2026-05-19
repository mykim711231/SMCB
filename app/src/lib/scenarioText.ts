/**
 * 실전 상황(scenarios) body 문자열에서 음성 재생 대상 중국어 줄과
 * 그에 대응되는 병음/한국어 해석을 묶음으로 추출.
 *
 * 배경:
 *  - scenarios.body는 마크다운 + 중국어 인용 + 병음 + 한국어 해석이 한 덩어리
 *    문자열로 섞여 있다. 학습용으로 zh/pinyin/ko를 함께 보여주면서 zh마다
 *    TTS 버튼을 노출하기 위해 셋을 한 묶음(Block)으로 추출해야 한다.
 *  - 이 함수는 **빌드 타임(build-tts.ts)**과 **런타임(Lesson 페이지)**에서
 *    동일하게 사용되어야 매니페스트 키와 TTS 요청 키가 정확히 일치한다.
 *
 * 데이터 형태 두 가지:
 *  1) 다중 라인 블록: 한자 줄 + 다음 줄 병음 + 다음 줄 한국어. 빈 줄이 경계.
 *  2) 단일 라인 QA: `"질문zh" 질문pinyin → "응답zh" 응답pinyin` (자주 받는 질문 대비).
 *     `→` 양옆을 별도 Block으로 분리해 페어로 짝지어 노출 — Lesson 페이지의
 *     "예문 듣기"가 질문/응답 그룹으로 보이게 한다.
 *
 * 추출 규칙:
 *  1. body를 newline으로 split. 빈 줄은 현재 진행 중인 multi-line block의 경계.
 *  2. 한 줄에 `→`(또는 `->`)가 있으면 단일 라인 QA로 판정:
 *      - 양옆을 각각 segment로 보고 한자/병음/한국어를 즉시 분리(`extractBlockFromSegment`).
 *      - QA item으로 emit. 진행 중인 multi-line block은 먼저 flush.
 *  3. 한자가 있는 줄이 등장하면 새 multi-line block 시작:
 *      - 한자 시퀀스들을 ' '로 join해서 block.zh로 저장.
 *      - 한자 시퀀스 뒤 남은 텍스트(splitInlineTail)에서 inline pinyin / inline ko 분리.
 *  4. 다음 줄이 비-zh이고 multi-line block이 살아있으면 누적:
 *      - 한글 포함 → block.ko에 합침.
 *      - 한글 없음(라틴 + 톤 마크 + 구두점) → block.pinyin에 합침.
 *  5. 다음 zh 줄/QA 줄/빈 줄에서 multi-line block flush.
 *  6. 마크다운 잡음(**...**, leading `- `, leading `1.`, 따옴표)은 제거한다.
 */

const HAN = /[一-鿿]/;
const HANGUL = /[가-힣]/;
const ZH_TOKEN_G = /[一-鿿][一-鿿　-〿＀-￯]*/g;

export type ScenarioBlock = {
  zh: string;
  pinyin: string;
  ko: string;
};

/**
 * 한 줄(또는 QA 한쪽 segment)에서 추출한 항목.
 *  - `qa`: `"질문zh" 병음 → "응답zh" 병음` 패턴의 페어.
 *  - `single`: 다중 라인 블록 또는 단일 라인 중 → 없는 항목.
 */
export type ScenarioItem =
  | { kind: 'qa'; question: ScenarioBlock; answer: ScenarioBlock | null }
  | { kind: 'single'; block: ScenarioBlock };

function stripMarkdown(s: string): string {
  return s
    // **굵게:** 류 prefix 제거 — 메타 라벨("나쁜 예", "좋은 예")을 ko로 잘못 잡지 않기 위함.
    .replace(/\*\*([^*]+)\*\*[：:]?/g, '')
    // leading "- " 또는 "* " 글머리, "1." "2)" 같은 번호 글머리.
    .replace(/^[\s]*[-*][\s]+/, '')
    .replace(/^[\s]*\d+[.)][\s]+/, '')
    // leading/trailing 따옴표류와 별표.
    .replace(/^[\s"'""''*]+/, '')
    .replace(/[\s"'""''*]+$/, '')
    // 줄 가운데 빈 괄호/따옴표 잔여 처리.
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * zh 시퀀스 뒤에 남은 텍스트에서 inline pinyin / inline ko 분리.
 * 한 줄에 zh + pinyin + (선택) ko가 모두 들어있는 케이스를 흡수한다.
 */
function splitInlineTail(tail: string): { pinyin: string; ko: string } {
  const cleaned = stripMarkdown(tail);
  if (!cleaned) return { pinyin: '', ko: '' };
  const hangulIdx = cleaned.search(HANGUL);
  if (hangulIdx < 0) return { pinyin: cleaned, ko: '' };
  return {
    pinyin: stripMarkdown(cleaned.slice(0, hangulIdx)),
    ko: stripMarkdown(cleaned.slice(hangulIdx)),
  };
}

/**
 * 한 segment(라인 또는 QA 한쪽)에서 단일 Block 추출.
 * → 양옆을 각각 호출하기 위함. 한자가 없으면 null.
 */
function extractBlockFromSegment(segment: string): ScenarioBlock | null {
  const cleaned = stripMarkdown(segment);
  if (!cleaned) return null;
  const matches = [...cleaned.matchAll(ZH_TOKEN_G)];
  if (matches.length === 0) return null;
  const zh = matches.map((m) => m[0]).join(' ').trim();
  if (!zh) return null;
  const lastMatch = matches[matches.length - 1];
  const tailStart = (lastMatch.index ?? 0) + lastMatch[0].length;
  const tail = cleaned.slice(tailStart);
  const inline = splitInlineTail(tail);
  return { zh, pinyin: inline.pinyin, ko: inline.ko };
}

/**
 * body → 화면 노출 단위(item) 리스트. QA(질문/응답) 또는 단일 Block.
 * Lesson 페이지의 "예문 듣기"가 이 리스트를 그대로 렌더.
 */
export function extractScenarioItems(body: string): ScenarioItem[] {
  if (!body) return [];
  const lines = body.split('\n');
  const items: ScenarioItem[] = [];
  let current: ScenarioBlock | null = null;
  // 멀티라인 QA: 질문 블록 완성 후 `→ 응답zh` 라인을 만나면 current는
  // 응답 블록으로 교체되고 직전 질문이 pendingQuestion에 보관된다. flush 시
  // pendingQuestion이 살아있으면 단일 single이 아닌 qa item을 emit.
  let pendingQuestion: ScenarioBlock | null = null;

  const flush = (): void => {
    if (pendingQuestion) {
      items.push({
        kind: 'qa',
        question: pendingQuestion,
        answer: current && current.zh ? current : null,
      });
    } else if (current && current.zh) {
      items.push({ kind: 'single', block: current });
    }
    current = null;
    pendingQuestion = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      // 빈 줄은 block 경계 — 빈 줄 뒤의 메타 라벨이 직전 block의 ko로
      // 잘못 흡수되는 회귀를 막는다.
      flush();
      continue;
    }

    // QA 줄: → 양옆을 각각 segment로 분리.
    const arrowIdx = line.indexOf('→');
    const ascIdx = line.indexOf('->');
    const hasArrow = arrowIdx >= 0 || ascIdx >= 0;
    if (hasArrow) {
      const sep = arrowIdx >= 0 ? '→' : '->';
      const idx = arrowIdx >= 0 ? arrowIdx : ascIdx;
      const q = extractBlockFromSegment(line.slice(0, idx));
      const a = extractBlockFromSegment(line.slice(idx + sep.length));
      if (q && a) {
        // 단일 라인 QA: 양옆이 한 줄에 모두 있다.
        flush();
        items.push({ kind: 'qa', question: q, answer: a });
      } else if (!q && a && current && current.zh) {
        // 멀티라인 QA: 질문은 이전 줄들에서 누적된 current. → 줄에는 응답 zh만.
        // current를 질문으로 보존하고 응답 블록으로 교체 — 이어지는 pinyin/ko
        // 줄들이 응답 블록에 누적되도록 한다.
        pendingQuestion = current;
        current = a;
      } else if (q) {
        // 응답이 비어 있는 변형 — 질문만 single로.
        flush();
        items.push({ kind: 'single', block: q });
      }
      continue;
    }

    if (HAN.test(line)) {
      flush();
      const matches = [...line.matchAll(ZH_TOKEN_G)];
      if (matches.length === 0) continue;
      const zh = matches.map((m) => m[0]).join(' ').trim();
      if (!zh) continue;
      const lastMatch = matches[matches.length - 1];
      const tailStart = (lastMatch.index ?? 0) + lastMatch[0].length;
      const tail = line.slice(tailStart);
      const inline = splitInlineTail(tail);
      current = { zh, pinyin: inline.pinyin, ko: inline.ko };
    } else if (current) {
      const cleaned = stripMarkdown(line);
      if (!cleaned) continue;
      if (HANGUL.test(cleaned)) {
        current.ko = current.ko ? `${current.ko} ${cleaned}` : cleaned;
      } else {
        current.pinyin = current.pinyin ? `${current.pinyin} ${cleaned}` : cleaned;
      }
    }
    // current가 null이고 비-zh / 비-QA 줄은 무시 (zh 줄 이전의 도입 텍스트).
  }
  flush();
  return items;
}

/**
 * `**나쁜 예 (X):** ...` / `**좋은 예 (O):** ...` 형태의 마크다운 라벨을
 * 그룹 헤더로 인식해 그 아래 items를 묶는 단위.
 *
 * label은 시각적 머리글. 비어 있으면 헤더 없이 items만 노출하면 된다.
 */
export type ScenarioSection = {
  label: string;
  items: ScenarioItem[];
};

/**
 * 한 줄에서 `**xxx:**` 머리글을 떼어내고, 머리글 뒤에 따라오는
 * 설명 텍스트(한자가 등장하기 전까지의 한국어/기호)는 label에 흡수,
 * 한자가 시작되는 지점부터는 같은 줄에 있는 예문으로 items 추출하도록 rest로 반환.
 */
function extractSectionLabel(line: string): { label: string; rest: string } | null {
  const m = /^\*\*([^*]+?):\*\*\s*(.*)$/.exec(line);
  if (!m) return null;
  const head = m[1].trim();
  const tail = m[2];
  const hanIdx = tail.search(HAN);
  if (hanIdx < 0) {
    const desc = stripMarkdown(tail);
    return { label: desc ? `${head}: ${desc}` : `${head}:`, rest: '' };
  }
  const desc = stripMarkdown(tail.slice(0, hanIdx));
  return {
    label: desc ? `${head}: ${desc}` : `${head}:`,
    rest: tail.slice(hanIdx),
  };
}

/**
 * body → 라벨로 그룹화된 섹션 리스트. 라벨이 없는 본문은 label=''인 단일 섹션.
 */
export function extractScenarioSections(body: string): ScenarioSection[] {
  if (!body) return [];
  const lines = body.split('\n');
  const sections: ScenarioSection[] = [];
  let currentLabel = '';
  let currentChunk: string[] = [];

  const flush = (): void => {
    const items = extractScenarioItems(currentChunk.join('\n'));
    if (currentLabel || items.length > 0) {
      sections.push({ label: currentLabel, items });
    }
    currentLabel = '';
    currentChunk = [];
  };

  for (const raw of lines) {
    const labelInfo = extractSectionLabel(raw.trim());
    if (labelInfo) {
      flush();
      currentLabel = labelInfo.label;
      if (labelInfo.rest) currentChunk.push(labelInfo.rest);
      continue;
    }
    currentChunk.push(raw);
  }
  flush();
  return sections;
}

/**
 * 호환용 — sections를 flat ScenarioBlock 리스트로 변환.
 * QA는 [question, answer] 순서로 펼친다.
 */
export function extractScenarioBlocks(body: string): ScenarioBlock[] {
  const blocks: ScenarioBlock[] = [];
  for (const section of extractScenarioSections(body)) {
    for (const it of section.items) {
      if (it.kind === 'qa') {
        blocks.push(it.question);
        if (it.answer) blocks.push(it.answer);
      } else {
        blocks.push(it.block);
      }
    }
  }
  return blocks;
}

/**
 * 빌드 스크립트가 매니페스트 entry로 등록할 zh 키 목록.
 * Lesson 페이지의 TTSButton text와 정확히 같은 형태여야 한다.
 */
export function extractScenarioZhLines(body: string): string[] {
  return extractScenarioBlocks(body).map((b) => b.zh);
}
