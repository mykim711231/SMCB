# 새문안교회 중국어 중급 성경반 PWA — 상세 설계서

> **문서 버전**: v1.2  
> **작성일**: 2026-05-18  
> **상태**: 설계 확정안 (개발 시작 전 최종 검토)

---

## 0. 결정사항 요약 (Decisions)

| 항목 | 결정 |
|---|---|
| 접근 제어 | **완전 공개** — URL만 알면 접근, 로그인 없음 |
| MVP 범위 | (1) 65과 + TTS · (2) 한자·병음·한글 토글 + 진도 · (3) 통합 검색 · (4) 플래시카드 SRS — **4개 모두 포함** |
| 디자인 톤 | **모던 학습앱** (밝은 배경 + 포인트 컬러, 카드형 UI) + **큰글씨 토글 옵션** |
| 배포 | **GitHub Pages** (`https://gababayo.github.io/SMCB/`), 앱스토어 미사용 |
| 음성 | 디바이스 내장 Web Speech API (TTS) |
| 분석 도구 | **미설치** (사용자 추적 없음) |
| 알림 | 웹 푸시 미사용 → **카카오톡 채널/오픈채팅 링크**로 대체 |
| 앱 아이콘 | 새문안교회 로고 사용 허가 보류 → **임시 텍스트 마크 "SMCB·中"** SVG 사용 |
| 용량 정책 | **단말기 디스크 점유 최소화 우선** — install 시 최소 precache(앱 셸+vol1만), vol2/3은 진입 시 lazy, 사용자가 캐시 정리 가능 |
| 저작권 | Footer 표기 + About 페이지 안내문 의무 |

---

## 1. 프로젝트 개요

### 1.1 목적
새문안교회 중국어 중급 성경반 교재(vol1·vol2·vol3 총 65과 + 부록 3종)를 모바일·데스크톱 양쪽에서 학습할 수 있도록 PWA로 제작한다. 앱스토어를 거치지 않고 URL 한 줄로 배포하며, 오프라인·음성·검색·복습(플래시카드)을 모두 지원한다.

### 1.2 핵심 가치 제안
- **언제든** 인터넷 없이도 학습 (PWA 오프라인)
- **누구나** 설치 장벽 없이 시작 (앱스토어 X, 로그인 X)
- **들으며** 학습 (디바이스 내장 TTS)
- **꾸준히** 복습 (플래시카드 SRS)

### 1.3 비목표 (Out of Scope, Phase 1)
- 사용자 계정 / 클라우드 동기화 (Phase 3 옵션)
- 채점·시험 기능
- 멀티 디바이스 진도 공유
- 동영상 강의
- **웹 푸시 알림** (브라우저 권한 부담) → 외부 카카오톡 채널 링크로 갈음
- **사용자 분석/추적** (개인정보 부담 0, 로그 없음)

### 1.4 저작권 & 안내문 (필수)

**Footer (모든 화면 하단):**
```
© Saemunan Church Mandarin Bible Class. All Rights Reserved.
```

**About 페이지 (설정 → 정보):**
> ### 콘텐츠 출처 및 이용 안내
> 본 애플리케이션에서 제공하는 성경 연구 자료 및 교재 콘텐츠의
> 저작권은 **새문안교회 중국어 성경반(중급)**에 있습니다.
> 본 콘텐츠는 성경반 회원들의 학습 목적을 위해 제공되며,
> 무단 복제 및 상업적 이용을 금합니다.

**카카오톡 채널 링크**: About 페이지에 "📢 카카오톡으로 공지 받기" 버튼 — 새 탭으로 열기. (실제 URL은 운영자가 추후 제공)

---

## 2. 사용자 페르소나 & 시나리오

### 2.1 페르소나

| 페르소나 | 특징 | 주요 사용 맥락 |
|---|---|---|
| **P1 김집사 (50대 여)** | 시력 약화, Android 중급폰, 평일 저녁·주말 학습 | 큰글씨, 천천히 듣기, 한글 번역 의존 |
| **P2 박청년 (20대 남)** | iPhone 사용, 출퇴근 지하철, 단기선교 준비 | 한자만 보기, 빠른 속도 TTS, 플래시카드 |
| **P3 이전도사 (40대 여)** | 데스크톱 + 모바일 병행, 가르치는 입장 | 검색·인용·전도회화 시나리오 빠른 참조 |
| **P4 단기선교팀 (오프라인)** | 중국 현지·시골 선교지, 인터넷 불안정 | 오프라인 모드 필수, 부록 문화/용어 참조 |

### 2.2 핵심 시나리오 (User Journey)
1. 사용자가 교회 주보 QR을 스캔 → 브라우저에서 URL 열림
2. 첫 진입 시 "홈화면에 추가" 가이드 모달 → 설치
3. 홈 → "이어 학습하기" 또는 권 선택
4. 레슨 진입 → 본문 카드 → 🔊 탭으로 중국어 듣기
5. 모르는 단어는 즐겨찾기 → 플래시카드로 복습
6. 다음날 알림 없이 자발적 재진입 → 진도 자동 복원

---

## 3. 기술 스택 (확정)

| 영역 | 선택 | 버전 | 근거 |
|---|---|---|---|
| 빌드 도구 | Vite | ^5.4 | ESM 기반, 빠른 HMR, 작은 번들 |
| 프레임워크 | React | 18.x | 안정성, 생태계 |
| 언어 | TypeScript | ^5.4 | 타입 안전성 |
| 라우팅 | React Router | ^6.26 (HashRouter) | iOS PWA 새로고침 404 회피 |
| 상태 관리 | Zustand | ^4.5 | 가볍고 보일러플레이트 적음 |
| 스타일 | Tailwind CSS | ^3.4 | 유틸리티 우선, 디자인 토큰 활용 |
| PWA | vite-plugin-pwa + Workbox | ^0.20 | Service Worker 자동 생성 |
| 로컬 저장 | idb-keyval | ^6.2 | IndexedDB 간단 래퍼 |
| 검색 | MiniSearch | ^7.0 | 한자·병음·한글 토크나이저 커스텀 가능 |
| 마크다운 파서 | unified + remark-parse | latest | .md → JSON 변환 (빌드 타임) |
| 폰트 | **시스템 폰트만** (웹폰트 미사용) | — | 용량 0KB, 한자 폴백 체인으로 처리 |
| 테스트 | Vitest + Testing Library | ^2.0 | Vite 네이티브 통합 |
| 배포 | **GitHub Pages** | — | 무료 HTTPS, base path `/SMCB/` |
| CI | GitHub Actions (`actions/deploy-pages@v4`) | — | main push 시 자동 빌드·배포 |
| 압축 | Vite 빌드 시 brotli + gzip 사전 생성 | — | GitHub Pages는 gzip만 서빙하지만 미래 호스팅 대비 |

**번들 목표**: 초기 JS gzip < **100KB** (강화), 콘텐츠 vol별 chunk, 첫 LCP < 2.5s (3G)

---

## 4. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Repository                                          │
│  ├── Doc/*.md                  ← 단일 진실 소스             │
│  ├── app/scripts/              ← 빌드 타임 변환             │
│  │   └── build-content.ts                                   │
│  └── app/src/                  ← React PWA                  │
└─────────────────────────────────────────────────────────────┘
                       │ git push
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions (CI)                                        │
│  1. Doc/*.md → src/data/lessons.json                        │
│  2. vite build                                              │
│  3. Workbox precache manifest 생성                          │
└─────────────────────────────────────────────────────────────┘
                       │ deploy
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Pages (HTTPS, CDN, edge cache)                  │
└─────────────────────────────────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  User Device                                                │
│  ├── Browser (Chrome / Safari / Edge)                       │
│  ├── Service Worker (Workbox) ← 오프라인 캐시               │
│  ├── IndexedDB                ← 진도·즐겨찾기·SRS 상태      │
│  └── SpeechSynthesis API      ← OS 내장 TTS                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 콘텐츠 데이터 모델 & 파이프라인

### 5.1 마크다운 → JSON 변환

`scripts/build-content.ts`가 `Doc/**/*.md`를 읽어 다음 구조로 변환:

```ts
// app/src/types/lesson.ts
export type Verse = {
  zh: string;       // 한자
  pinyin: string;   // 병음
  ko: string;       // 한글 번역
};

export type VocabEntry = {
  id: string;            // "vol1_01_v1"
  word: string;          // "上帝"
  pinyin: string;        // "Shàngdì"
  pos: string;           // "명사 (n.)"
  meaning: string;       // "하나님, 상제"
  hanjaNote?: string;    // 한자 풀이
  example?: Verse;       // 예문
};

export type PronRow = {
  hanzi: string; pinyin: string; ko: string; note: string;
};

export type GrammarPoint = {
  pattern: string;       // "A 是 B"
  meaningKo: string;
  examples: Verse[];
  note?: string;         // 부정/의문 등
};

export type BibleQuote = {
  ref: string;           // "约翰一书 4:8"
  refKo: string;         // "요한일서 4:8"
  text: Verse;
};

export type Dialog = {
  role?: string;         // "A", "B", "전도자"
  lines: Verse[];        // 한 사람 발화 묶음 또는 개별 라인
};

export type Scenario = {
  title: string;
  body: string;          // 마크다운 그대로 (간단 렌더)
};

export type Question = Verse;

export type Lesson = {
  id: string;            // "vol1_01"
  vol: 1 | 2 | 3;
  no: number;            // 1~32
  titleZh: string;
  titlePinyin: string;
  titleKo: string;
  body: Verse[];
  vocab: VocabEntry[];
  pronunciation: PronRow[];
  grammar: GrammarPoint[];
  bible: BibleQuote[];
  dialogDaily: Dialog[];
  dialogGospel: Dialog[];
  scenarios: Scenario[];
  questions: Question[];
};

export type Appendix = {
  id: "appendix1" | "appendix2" | "appendix3";
  title: string;
  markdown: string;      // 원본 그대로
};

export type ContentBundle = {
  buildHash: string;     // 콘텐츠 버전 해시
  lessons: Lesson[];     // 65개
  appendices: Appendix[];// 3개
};
```

### 5.2 파서 규칙
- 헤더 `## 本文 (본문)` → `body`
- 헤더 `## 主要词汇 (주요 단어)` → 그 아래 `### N. word / pinyin / pos / meaning` 블록 N개를 `vocab[]`로
- 본문/회화 등에서 3줄 패턴 (한자 → 병음 → 한글) 을 `Verse`로 묶음
- 표(`| ... |`)는 `pronunciation` 또는 `grammar`로 매핑

### 5.3 빌드 산출물
- `app/src/data/lessons.json` (65개 통합, gzip 약 500KB 예상)
- `app/src/data/appendices.json`
- `app/src/data/search-index.json` (MiniSearch 사전 빌드)

---

## 6. 화면 명세 (Screen Specs)

### 6.1 화면 목록

| ID | 화면명 | 우선순위 | 경로 |
|---|---|---|---|
| S-001 | 홈 (Home) | P0 | `/` |
| S-002 | 목차 (Table of Contents) | P0 | `/toc` |
| S-003 | 레슨 상세 (Lesson Detail) | P0 | `/lesson/:id` |
| S-004 | 검색 (Search) | P0 | `/search` |
| S-005 | 플래시카드 (Flashcards) | P0 | `/flashcards` |
| S-006 | 부록 (Appendix) | P1 | `/appendix/:id` |
| S-007 | 설정 (Settings) | P0 | `/settings` |
| S-008 | 설치 안내 모달 (Install Prompt) | P0 | overlay |
| S-009 | 정보 (About) | P0 | `/about` |

### 6.2 S-001 홈

**레이아웃**:
```
┌──────────────────────────────────┐
│  ☰  SMCB 中文 성경반        ⚙   │  ← 상단바
├──────────────────────────────────┤
│  ╭────────────────────────╮      │
│  │ 오늘의 한 구절          │      │  ← 매일 다른 verse
│  │ 神就是爱。             │      │
│  │ Shén jiùshì ài.        │      │
│  │ 하나님은 곧 사랑이시다.│ 🔊  │
│  ╰────────────────────────╯      │
│                                  │
│  ▶  이어 학습하기                │  ← 마지막 학습 lesson
│  Vol.1 · 04과 · 耶稣              │
│  ████████░░ 80%                 │
│                                  │
│  📚 권 선택                      │
│  [Vol.1]  [Vol.2]  [Vol.3]      │
│                                  │
│  🃏 오늘의 복습 (12장)            │  ← SRS due cards
│                                  │
│  [홈] [목차] [검색] [복습] [설정]│  ← 하단 탭바
└──────────────────────────────────┘
```

**컴포넌트**: `<VerseOfDay>`, `<ContinueCard>`, `<VolumeTiles>`, `<SrsTodayCard>`, `<BottomNav>`

### 6.3 S-002 목차

- 상단 탭: Vol.1 (16) / Vol.2 (17) / Vol.3 (32)
- 각 과 행: `01. 神的爱 · 하나님의 사랑   ✓ ⭐`
  - ✓ 완료 / ⭐ 즐겨찾기
- 우측 진도 도넛 (vol별 % + 전체 %)
- 검색 바 (간단 텍스트 필터)

### 6.4 S-003 레슨 상세 (핵심 화면)

**구조**: 상단 sticky header + 섹션 탭 + 본문 카드 스택

```
┌──────────────────────────────────┐
│ ← 01. 神的爱 (하나님의 사랑)     │
│   Shén de ài                     │
├──────────────────────────────────┤
│ [본문][단어][발음][어법][성경]    │  ← 가로 스크롤 탭
│ [일상][전도][시나리오][질문]     │
├──────────────────────────────────┤
│ 표시 모드: [🔘 전체] [한자+병음] │
│           [한자만]               │
├──────────────────────────────────┤
│ ╭────────────────────────╮  🔊  │
│ │ 上帝是神。             │      │
│ │ Shàngdì shì shén.      │      │
│ │ 하나님은 신이시다.     │      │
│ ╰────────────────────────╯      │
│                                  │
│ ╭────────────────────────╮  🔊  │
│ │ 神就是爱。             │ ⭐  │
│ │ Shén jiùshì ài.        │      │
│ │ 하나님은 곧 사랑이시다.│      │
│ ╰────────────────────────╯      │
│ ...                              │
│                                  │
│ [◀ 이전 과]  [다음 과 ▶]        │
└──────────────────────────────────┘
```

**상호작용**:
- 🔊 단일 탭: 중국어(zh-CN) 한 번 재생
- 🔊 길게 누름(>500ms): 한국어(ko-KR) 재생
- 카드 더블탭: 즐겨찾기 토글
- 우측 상단 ▶▶: 본문 전체 자동 연속 재생 모드
- 단어 섹션에서 "📥 카드에 추가" → SRS Leitner Box1 투입
- 스크롤이 70% 이상 도달 시 자동 "완료" 표시
- 좌우 스와이프로 이전/다음 과 이동

### 6.5 S-004 검색

- 상단 검색바 (실시간 디바운스 200ms)
- 필터 칩: [한자] [병음] [한글] [본문] [단어] [성경]
- 결과 리스트: 매칭 문맥 ±20자 하이라이트
- 결과 탭 시 해당 레슨의 해당 verse로 스크롤 점프

### 6.6 S-005 플래시카드 (SRS)

**알고리즘**: Leitner 5박스 (단순화된 SRS, 오프라인 친화)

| 박스 | 다음 복습 간격 |
|---|---|
| 1 | 1일 |
| 2 | 3일 |
| 3 | 7일 |
| 4 | 14일 |
| 5 | 30일 (마스터) |

**규칙**:
- 정답(쉬움) → 다음 박스
- 오답(어려움) → Box 1으로 강등
- Box 5에서 정답 → "마스터" 처리 (큐 제외)

**카드 UI**:
```
┌──────────────────────────────────┐
│ 오늘 복습: 12 / 30               │
│ Box 2 · 7일 후 재출제            │
├──────────────────────────────────┤
│                                  │
│        上 帝                    │  ← 앞면: 한자만
│                                  │
│         🔊                       │
│                                  │
│      [뜻 보기]                  │
└──────────────────────────────────┘

  뒤집은 후:
┌──────────────────────────────────┐
│        上 帝                    │
│       Shàngdì                   │
│       하나님, 상제              │
│                                  │
│  [😖 어려움] [😐 보통] [😊 쉬움]│
└──────────────────────────────────┘
```

### 6.7 S-006 부록

- 부록 1·2·3 마크다운을 prose 스타일로 렌더
- 부록1 (용어집): 표 그대로 렌더, 단어 탭 시 발음 듣기
- 부록2 (문화): 일반 마크다운 렌더
- 부록3 (검토보고서): 일반 마크다운 렌더 + 코드블록 syntax

### 6.8 S-007 설정

| 설정 | 옵션 | 기본값 |
|---|---|---|
| 글자 크기 | 작게(90%) / 보통(100%) / 크게(120%) / 매우 크게(140%) | 보통 |
| 다크 모드 | 시스템 / 라이트 / 다크 | 시스템 |
| 표시 모드 기본값 | 전체 / 한자+병음 / 한자만 | 전체 |
| TTS 음성 (zh-CN) | 사용 가능 보이스 목록 | OS 기본 |
| TTS 음성 (ko-KR) | 사용 가능 보이스 목록 | OS 기본 |
| TTS 속도 | 0.5× ~ 1.5× (슬라이더) | 0.9× |
| 자동 연속 재생 간격 | 0.5s ~ 3s | 1.0s |
| **저장공간 사용량** | 앱셸/콘텐츠/검색/IndexedDB 항목별 KB 표시 (`navigator.storage.estimate()`) | 실시간 |
| **캐시 정리** | Cache Storage만 비움 (진도·즐겨찾기 보존) | — |
| **전체 초기화** | Cache + IndexedDB 모두 삭제, 첫 진입 상태로 | — |
| 캐시 상태 / 업데이트 | 현재 버전 표시, "업데이트 확인" | — |
| 정보 | 버전, 라이선스, 새문안교회 링크 → About 페이지 이동 | — |

### 6.9 S-008 설치 안내 모달

- iOS Safari 감지 시: "공유 → 홈 화면에 추가" 시각적 가이드
- Android Chrome: `beforeinstallprompt` 이벤트로 네이티브 설치 UI 트리거
- "다시 보지 않기" 옵션, 7일 후 재표시

### 6.10 S-009 정보 (About)

**경로**: `/about` (설정 페이지에서 "정보" 메뉴 진입, 또는 Footer 클릭)

**구성**:
```
┌──────────────────────────────────┐
│ ← 정보                           │
├──────────────────────────────────┤
│  [SMCB·中 아이콘]                │
│  새문안 중국어 성경반            │
│  v1.0.0 · 빌드 2026-05-18        │
│                                  │
│  ──────────────────────────      │
│  콘텐츠 출처 및 이용 안내        │
│                                  │
│  본 애플리케이션에서 제공하는    │
│  성경 연구 자료 및 교재 콘텐츠의 │
│  저작권은 새문안교회 중국어      │
│  성경반(중급)에 있습니다.        │
│                                  │
│  본 콘텐츠는 성경반 회원들의     │
│  학습 목적을 위해 제공되며,      │
│  무단 복제 및 상업적 이용을      │
│  금합니다.                       │
│                                  │
│  ──────────────────────────      │
│  📢 카카오톡으로 공지 받기 →    │  ← 외부 링크 (운영자 URL)
│  ──────────────────────────      │
│                                  │
│  ⓘ 사용된 오픈소스               │
│     React, Vite, Workbox 등      │
│                                  │
│  ── 개인정보 안내 ──             │
│  본 앱은 어떠한 사용자 정보도    │
│  외부로 전송하지 않습니다.       │
│  모든 학습 기록은 사용자 기기    │
│  내부에만 저장됩니다.            │
│                                  │
└──────────────────────────────────┘
  © Saemunan Church Mandarin
  Bible Class. All Rights Reserved.
```

**카카오톡 링크**: `target="_blank" rel="noopener noreferrer"`, URL은 환경변수 또는 `app/src/config.ts` 상수로 관리. 운영자가 추후 제공한 URL을 코드 한 줄 수정으로 반영.

---

## 7. 디자인 시스템

### 7.1 컬러 토큰

```css
/* Light mode */
--color-bg:           #FAFAFA;
--color-surface:      #FFFFFF;
--color-text:         #1F2937;
--color-text-muted:   #6B7280;
--color-primary:      #2563EB;  /* 파란 — 학습 신뢰감 */
--color-primary-soft: #DBEAFE;
--color-accent:       #F59E0B;  /* 즐겨찾기·강조 */
--color-success:      #10B981;
--color-divider:      #E5E7EB;
--color-pinyin:       #4B5563;  /* 본문보다 옅게 */

/* Dark mode */
--color-bg:           #0F172A;
--color-surface:      #1E293B;
--color-text:         #F1F5F9;
--color-text-muted:   #94A3B8;
--color-primary:      #60A5FA;
--color-primary-soft: #1E3A8A;
--color-accent:       #FBBF24;
--color-success:      #34D399;
--color-divider:      #334155;
--color-pinyin:       #CBD5E1;
```

### 7.2 타이포

| 용도 | 크기 (기본 100%) | weight |
|---|---|---|
| 본문 한자 | 22px | 500 |
| 본문 병음 | 16px | 400 (italic) |
| 본문 한글 | 16px | 400 |
| 제목(H1) | 24px | 700 |
| 제목(H2) | 20px | 600 |
| 캡션 | 13px | 400 |

**큰글씨 모드**: CSS 변수 `--font-scale` 적용 (1.0 / 1.2 / 1.4 / 1.6) → 모든 폰트 사이즈에 곱셈.

**폰트 패밀리 (웹폰트 0KB 정책)**:
```css
/* 본문/UI — 시스템 한국어 + 한자 폴백 */
--font-sans:
  system-ui, -apple-system, "Segoe UI", Roboto,
  "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕",
  "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
  sans-serif;

/* 병음 (라틴 + 성조 부호) — 시스템 세리프/산세리프 */
--font-pinyin:
  -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

**원칙**:
- **웹폰트(Noto Sans SC 등) 다운로드 금지** — 모든 OS에 한자 시스템 폰트가 이미 존재 (Windows: Microsoft YaHei / macOS·iOS: PingFang SC / Android: Noto Sans CJK SC 또는 Droid Sans Fallback). 추가 네트워크 0KB.
- iOS Safari·Android Chrome 모두 한자 폴백이 자동 동작하므로 시각적 차이 거의 없음.
- 만약 특정 구형 Android에서 한자 일부가 두부(豆腐)로 보이면 → 설정 화면에 "한자 폰트 다운로드(선택)" 버튼 노출 (Phase 2 옵션, 사용자 동의 시에만).

### 7.3 간격 / 라운드

- spacing scale: 4, 8, 12, 16, 24, 32px
- radius: card 12px, button 8px, chip 999px
- shadow: `0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)`

### 7.4 모션
- 카드 진입: 200ms ease-out fade-up
- 카드 뒤집기: 300ms cubic-bezier(0.4, 0, 0.2, 1) rotateY
- prefers-reduced-motion 존중 → 모션 제거

### 7.5 글로벌 레이아웃 (Footer 의무)

**모든 페이지 하단에 Footer 표시** (`<Footer />` 컴포넌트):

```tsx
// app/src/components/Footer.tsx
export function Footer() {
  return (
    <footer className="text-center text-xs text-muted py-4 px-4
                       border-t border-divider mt-8 mb-[calc(64px+env(safe-area-inset-bottom))]">
      © Saemunan Church Mandarin Bible Class. All Rights Reserved.
    </footer>
  );
}
```

- 본문 영역(레슨 카드 스택, 검색 결과 등)이 짧을 때도 화면 하단 고정 X (sticky 아닌 일반 흐름)
- 하단 탭바(`BottomNav` 64px)와 겹치지 않도록 `margin-bottom`에 탭바 높이 + iOS safe-area inset 합산
- 모바일·데스크톱 동일하게 표시
- 다크/라이트 모드 모두 `text-muted` 토큰 사용 → 본문보다 옅은 회색
- Footer 텍스트 자체에 About 페이지(`/about`)로 가는 링크 wrapping

---

## 8. 상태 관리 (Zustand stores)

```ts
// stores/useSettingsStore.ts
{ fontScale, theme, displayMode, ttsVoiceZh, ttsVoiceKo, ttsRate, autoplayGap }

// stores/useProgressStore.ts
{ completed: Set<lessonId>, lastLessonId, scrollPositions: Record<id, number> }

// stores/useFavoriteStore.ts
{ verses: Set<verseId>, words: Set<wordId> }

// stores/useSrsStore.ts
{ cards: Record<wordId, { box: 1-5, nextReview: ISO date, history: [] }> }

// stores/useTTSStore.ts (runtime only)
{ voices: SpeechSynthesisVoice[], isSpeaking, currentUtterance }
```

모든 store는 `persist` 미들웨어로 IndexedDB 동기화. TTS 스토어만 메모리 전용.

---

## 9. TTS 상세 설계

### 9.1 추상화 레이어

```ts
// src/lib/tts.ts
export interface TTSAdapter {
  isSupported(): boolean;
  getVoices(lang: "zh-CN" | "ko-KR"): Promise<SpeechSynthesisVoice[]>;
  speak(text: string, opts: { lang; voice?; rate?; pitch? }): Promise<void>;
  stop(): void;
}

export class WebSpeechAdapter implements TTSAdapter { ... }
```

### 9.2 iOS 언락 패턴

```ts
// 첫 사용자 인터랙션에서 1회 실행
function unlockTTS() {
  const u = new SpeechSynthesisUtterance("");
  u.volume = 0;
  speechSynthesis.speak(u);
}
```

### 9.3 보이스 로딩 (비동기)

```ts
function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    let voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    speechSynthesis.addEventListener("voiceschanged", () => {
      resolve(speechSynthesis.getVoices());
    }, { once: true });
  });
}
```

### 9.4 폴백 매트릭스

| 상태 | 사용자에게 보이는 것 |
|---|---|
| `speechSynthesis` 미지원 | 🔊 버튼 회색 처리 + 툴팁 "이 기기는 음성을 지원하지 않습니다" |
| zh-CN 보이스 0개 | 설정 화면에 "중국어 음성 미설치" 카드 + Android: Google TTS 설치 링크 / iOS: 설정 → 손쉬운 사용 → 음성 가이드 |
| 재생 중 화면 잠금 | 안내 토스트 "백그라운드에서는 OS 정책상 음성이 중단될 수 있어요" |

### 9.5 자동 연속 재생

본문 verse 배열을 큐로 만들어 `speak()` 완료(`onend`) 시 다음 verse 재생, 사용자 설정 `autoplayGap`만큼 지연.

---

## 10. PWA · 오프라인 · 캐싱 전략

> **공통 전제**: GitHub Pages subpath 배포이므로 모든 절대 경로는 `/SMCB/` 로 프리픽스. Vite `base: "/SMCB/"` 설정 필수. SW scope, manifest의 `start_url`/`scope`, 아이콘 경로 모두 동일하게 일관 적용.

### 10.1 Service Worker 정책 (Workbox) — 디스크 점유 최소화

**Scope**: `/SMCB/` (manifest scope와 일치)

**원칙**: install 시점에는 **앱 셸(쉘)만** precache하여 디스크 점유를 최소화. 콘텐츠는 사용자가 실제 진입한 vol/부록만 캐시되도록 한다.

| 리소스 | 전략 | install 시 precache | 디스크 점유 시점 |
|---|---|---|---|
| HTML, 초기 JS/CSS, 아이콘 SVG | precache | ✅ (≈ 150KB) | 설치 즉시 |
| `lessons-meta.json` (타이틀만, ≈ 10KB) | precache | ✅ | 설치 즉시 |
| `lessons-vol1.json` (≈ 150KB) | CacheFirst | ❌ → 사용자 첫 진입 시 캐시 | vol1 첫 진입 시 |
| `lessons-vol2.json` (≈ 170KB) | CacheFirst | ❌ | vol2 첫 진입 시 |
| `lessons-vol3.json` (≈ 250KB) | CacheFirst | ❌ | vol3 첫 진입 시 |
| `appendices.json` (≈ 80KB) | CacheFirst | ❌ | 부록 첫 진입 시 |
| `search-index.json` (≈ 200KB) | CacheFirst | ❌ | 검색 첫 사용 시 |
| 마스커블 PNG (≈ 12KB) | precache | ✅ | 설치 즉시 |
| 외부 (없음) | - | - | - |

**디스크 점유 시나리오**:
| 사용 패턴 | 디스크 점유 (압축 해제 후 추정) |
|---|---|
| 설치만 하고 미사용 | ≈ **200 KB** |
| vol1만 학습 | ≈ **400 KB** |
| 전체 학습 + 검색 + 부록 | ≈ **1.2 MB** |
| 즐겨찾기·SRS·진도 풀 사용 (IndexedDB) | + **50~200 KB** |
| **총 최대** | ≈ **1.5 MB** |

비교: 일반 네이티브 앱 50~200MB / 다른 PWA 학습앱 10~30MB → **본 앱은 1/30 이하**

**CacheFirst 만료 정책 (오래된 캐시 자동 정리)**:
- `expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 90 }` (90일)
- 오래 안 들어간 vol은 자동 evict → 추가 디스크 절약

### 10.2 업데이트 UX
- `registerSW({ onNeedRefresh })` 콜백 → 화면 하단 토스트:
  "새 버전이 있습니다. [지금 업데이트]"
- 사용자 클릭 시 `skipWaiting` + `window.location.reload()`

### 10.3 manifest.webmanifest

> 위치: `app/public/manifest.webmanifest`, 빌드 후 `/SMCB/manifest.webmanifest`로 서빙.

```json
{
  "name": "새문안 중국어 성경반",
  "short_name": "SMCB 中文",
  "description": "새문안교회 중국어 중급 성경반 학습 PWA",
  "start_url": "/SMCB/",
  "scope": "/SMCB/",
  "id": "/SMCB/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FAFAFA",
  "theme_color": "#2563EB",
  "lang": "ko",
  "icons": [
    { "src": "/SMCB/icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
    { "src": "/SMCB/icons/icon-192.webp", "sizes": "192x192", "type": "image/webp", "purpose": "any" },
    { "src": "/SMCB/icons/icon-512.webp", "sizes": "512x512", "type": "image/webp", "purpose": "any" },
    { "src": "/SMCB/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**임시 아이콘 (로고 허가 보류 중)**:
- 단일 SVG 마크: 파란 둥근 사각형 배경 + 흰색 텍스트 `SMCB` 위에 작은 한자 `中` (가로 정렬)
- < 1KB SVG 한 장 + WebP 192/512 export (총 < 8KB)
- 정식 로고 확보 시 같은 파일명으로 교체만 하면 SW 캐시 무효화 후 자동 반영

### 10.4 GitHub Pages 라우팅 주의사항

- **HashRouter 사용** (`/SMCB/#/lesson/vol1_01`) → 새로고침 시 404 없음, SPA 정상 동작
- BrowserRouter 사용 시 GitHub Pages 404.html에 redirect 트릭 필요 → 복잡도/플리커 증가로 비채택
- 딥링크 공유 가능 (`https://gababayo.github.io/SMCB/#/lesson/vol2_05`)

---

## 11. 검색 설계

### 11.1 인덱싱 (빌드 타임)

`MiniSearch` 인스턴스를 빌드 시 만들어 `search-index.json`으로 serialize.

```ts
const idx = new MiniSearch({
  fields: ["zh", "pinyin", "ko"],
  storeFields: ["lessonId", "section", "verseIdx", "zh", "pinyin", "ko"],
  tokenize: (text, field) => {
    if (field === "zh") return text.split(""); // 한자 1글자 단위
    if (field === "pinyin") return text.toLowerCase().split(/[\s']+/);
    return text.toLowerCase().split(/\s+/);
  },
});
```

### 11.2 런타임 검색
- 입력 debounce 200ms
- `idx.search(query, { prefix: true, fuzzy: 0.2 })`
- 결과 최대 50개, 가상 스크롤
- 한자/병음/한글 자동 감지하여 필드 가중치 조정

---

## 12. 진도·즐겨찾기·SRS 데이터 모델

### 12.1 IndexedDB 키 구조 (idb-keyval)

| 키 | 값 |
|---|---|
| `settings` | SettingsState (JSON) |
| `progress` | ProgressState |
| `favorites` | FavoriteState |
| `srs` | SrsState |
| `lastVisit` | ISO date |

### 12.2 SRS 카드 생성 트리거
1. 사용자가 단어 섹션에서 "📥 카드에 추가" 탭
2. 자동 추가 옵션 (설정): 레슨 완료 시 그 과의 모든 단어 자동 Box1 투입

### 12.3 일일 큐 계산
```ts
function todayDue(srs: SrsState): WordId[] {
  const today = new Date().toISOString().slice(0, 10);
  return Object.entries(srs.cards)
    .filter(([_, c]) => c.nextReview <= today)
    .map(([id]) => id);
}
```

---

## 13. 폴더 구조 & Vite 설정

### 13.1 폴더 트리

```
SMCB/   (= GitHub repo gababayo/SMCB)
├── Doc/                          ← 원본 콘텐츠 (수정 금지 영역)
├── docs/
│   └── _design.md                ← 본 문서
├── app/
│   ├── package.json
│   ├── vite.config.ts            ← base: "/SMCB/"
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── index.html
│   ├── public/
│   │   ├── icons/
│   │   │   ├── icon.svg
│   │   │   ├── icon-192.webp
│   │   │   ├── icon-512.webp
│   │   │   └── icon-maskable-512.png
│   │   └── manifest.webmanifest
│   ├── scripts/
│   │   ├── build-content.ts      ← .md → vol별 JSON
│   │   ├── build-search-index.ts ← MiniSearch 사전 빌드
│   │   └── generate-icons.ts     ← SVG → WebP/PNG 자동 생성
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types/
│       │   └── lesson.ts
│       ├── data/                 ← 빌드 산출물 (gitignore)
│       │   ├── lessons-vol1.json
│       │   ├── lessons-vol2.json
│       │   ├── lessons-vol3.json
│       │   ├── lessons-meta.json ← 65과 메타정보(타이틀만, ≈ 10KB)
│       │   ├── appendices.json
│       │   └── search-index.json
│       ├── stores/
│       │   ├── useSettingsStore.ts
│       │   ├── useProgressStore.ts
│       │   ├── useFavoriteStore.ts
│       │   ├── useSrsStore.ts
│       │   └── useTTSStore.ts
│       ├── lib/
│       │   ├── tts.ts
│       │   ├── srs.ts
│       │   ├── search.ts
│       │   ├── db.ts
│       │   └── contentLoader.ts  ← vol별 동적 import
│       ├── components/
│       │   ├── BottomNav.tsx
│       │   ├── Footer.tsx        ← 저작권 표기
│       │   ├── VerseCard.tsx
│       │   ├── TTSButton.tsx
│       │   ├── WordCard.tsx
│       │   ├── ProgressRing.tsx
│       │   └── InstallPrompt.tsx
│       ├── pages/
│       │   ├── HomePage.tsx
│       │   ├── TocPage.tsx
│       │   ├── LessonPage.tsx        ← lazy
│       │   ├── SearchPage.tsx        ← lazy
│       │   ├── FlashcardsPage.tsx    ← lazy
│       │   ├── AppendixPage.tsx      ← lazy
│       │   ├── SettingsPage.tsx
│       │   └── AboutPage.tsx         ← 저작권/카카오톡 링크
│       ├── hooks/
│       │   ├── useTTS.ts
│       │   ├── useInstallPrompt.ts
│       │   └── useScrollProgress.ts
│       └── styles/
│           └── tokens.css
├── .gitignore                    ← app/src/data/*.json 무시
└── .github/
    └── workflows/
        └── deploy.yml            ← GitHub Pages 자동 배포
```

### 13.2 Vite 설정 핵심

```ts
// app/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  base: '/SMCB/',                       // ★ GitHub Pages subpath
  plugins: [
    react(),
    viteCompression({ algorithm: 'gzip', threshold: 1024 }),
    viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg', 'icons/*.webp'],
      manifest: false,                  // public/manifest.webmanifest 직접 사용
      workbox: {
        navigateFallback: '/SMCB/index.html',
        globPatterns: ['**/*.{js,css,html,svg,webp,json}'],
        runtimeCaching: [/* §10.1 표 참조 */],
      },
    }),
  ],
  build: {
    target: 'es2017',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          state: ['zustand', 'idb-keyval'],
          search: ['minisearch'],
        },
      },
    },
  },
});
```

---

## 14. 접근성 (a11y)

- 모든 인터랙티브 요소 최소 44×44px 터치 타깃
- `aria-label`: 🔊 버튼은 "중국어 발음 듣기"
- 키보드 내비게이션: Tab / Enter / Space 모두 지원
- 색상 대비 WCAG AA 이상 (4.5:1)
- `prefers-reduced-motion` 존중
- 스크린 리더용 페이지 타이틀 동적 업데이트 (`<title>`)
- 큰글씨 모드는 화면 단위가 아닌 글로벌 CSS 변수 → 모든 UI 일관 확대

---

## 15. 호환성 매트릭스

| 환경 | 최소 버전 | 핵심 기능 동작 | 비고 |
|---|---|---|---|
| Android Chrome | 60+ | 전체 동작 | PWA 설치, TTS, IndexedDB |
| Samsung Internet | 7+ | 전체 동작 | PWA 설치 가능 |
| iOS Safari | 12+ | 부분 | TTS unlock 필요, 설치 가이드 모달 |
| iOS Safari | 16.4+ | 전체 | Web Push 가능 (Phase 3 옵션) |
| Desktop Chrome/Edge | 80+ | 전체 동작 | |
| Desktop Firefox | 78+ | 전체 동작 | TTS 보이스 OS 의존 |
| Desktop Safari | 14+ | 전체 동작 | |

**Polyfill**: `core-js` 부분 적용, target `es2017`.

---

## 16. 성능 목표 (SLO)

| 지표 | 목표 (모바일 3G) |
|---|---|
| TTI (Time to Interactive) | < 3.5s |
| LCP | < 2.5s |
| 초기 JS gzip | < 150 KB |
| 콘텐츠 JSON gzip | < 500 KB |
| Lighthouse PWA score | ≥ 95 |
| Lighthouse Performance | ≥ 85 |

---

## 17. CI/CD

### 17.1 GitHub Actions (`.github/workflows/deploy.yml`)

```yaml
name: Deploy PWA to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: app/package-lock.json }
      - run: npm ci
        working-directory: app
      - run: npm run build:content       # Doc/*.md → JSON chunks
        working-directory: app
      - run: npm run build               # vite build → app/dist
        working-directory: app
      - uses: actions/upload-pages-artifact@v3
        with: { path: app/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Repo 설정**: Settings → Pages → Source: **GitHub Actions**.  
**최종 URL**: `https://gababayo.github.io/SMCB/`

### 17.2 콘텐츠 수정 워크플로
- `Doc/*.md` 수정 → push → CI 자동 트리거 → 약 2~3분 후 배포 완료
- 사용자 재진입 시 SW가 새 빌드 감지 → 업데이트 토스트 표시
- 코드 변경 없이 콘텐츠만 수정해도 정상 작동 (빌드 파이프라인이 매번 재변환)

### 17.3 PR 미리보기 (선택)
- 별도 브랜치 푸시 시: `dist`만 빌드해 artifact로 업로드 (실제 배포 X) → 로컬에서 `vite preview --base /SMCB/`로 확인

---

## 17.5 단말기 저장공간 최소화 전략 (Device Storage Diet)

> **목표**: PWA 설치 후 사용자 단말기의 디스크 점유량을 가능한 작게 유지한다.  
> "이 앱 N MB 사용 중" 표시값을 **설치만 시 < 250KB**, **전체 사용 시 < 2MB** 로 만든다.

### 17.5.1 저장공간 구성 요소 (사용자 단말기 기준)

PWA가 디바이스에 저장하는 데이터는 다음 4개 영역:

| 영역 | 내용 | 크기 영향 요소 |
|---|---|---|
| **Cache Storage** (SW) | HTML/JS/CSS/JSON/이미지 (네트워크 응답) | precache 정책 + runtime cache |
| **IndexedDB** | 진도·즐겨찾기·SRS·설정 | 사용자 행동 누적 |
| **localStorage** | (사용 안 함) | 0 |
| **App Shell (install)** | manifest, 아이콘 | < 20KB |

iOS Safari: PWA 데이터는 OS 정책상 정기적으로 정리되거나 7일 미사용 시 일부 정리될 수 있음. Android Chrome: 사용자가 "앱 정보 → 저장공간 → 데이터 삭제" 가능.

### 17.5.2 핵심 정책: Lazy Cache (필요할 때만 디스크에 적재)

| 정책 | 적용 |
|---|---|
| install 시 precache 최소화 | 앱 셸(150KB) + `lessons-meta.json`(10KB) + 아이콘(20KB) = **약 200KB만** |
| 콘텐츠 lazy cache | vol1/2/3 각 파일은 **사용자 진입 시점에만** Cache Storage에 저장 |
| 부록·검색 인덱스 lazy | 부록 페이지/검색 첫 사용까지는 디스크 점유 0 |
| 자동 만료 | 90일 미사용 캐시 항목 evict |
| 사용자 제어 | 설정 → 저장공간 → "캐시 정리" 버튼 (§6.8 추가) |

### 17.5.3 IndexedDB 슬림화

| 데이터 | 최대 예상 크기 | 정책 |
|---|---|---|
| settings | < 1 KB | JSON 객체 1개 |
| progress | < 5 KB | 65과 × {completed, scrollPos} |
| favorites | < 10 KB | 한도 없음, 사용자 누적 |
| srs (Leitner) | < 50 KB | 단어 ID + box + nextReview만 (전체 단어 데이터는 lessons.json에 있음, 참조만) |
| **합계 (heavy user)** | **< 100 KB** | — |

**규칙**:
- IndexedDB에는 **참조 ID와 상태만 저장**, 실제 콘텐츠는 Cache Storage의 JSON에서 lookup
- 진도·즐겨찾기 동일 단어 중복 저장 금지

### 17.5.4 자산 디스크 점유 최소화

압축 해제 후 실제 디스크 점유 기준으로 산정 (gzip이 아닌 raw).

| 자산 | 포맷 | 디스크 |
|---|---|---|
| 앱 아이콘 마스터 | SVG (디스크에도 작음) | < 1 KB |
| 192/512 PWA 아이콘 | WebP (PNG 대비 약 70% 절감) | < 6 KB / < 12 KB |
| 마스커블 아이콘 | PNG (Android 호환 필수, 예외 1개만) | < 15 KB |
| UI 픽토그램 | **인라인 SVG** (별도 파일·HTTP 요청 0) | 컴포넌트당 < 500B |
| 사진·일러스트·배경 | (없음) | 0 |
| 웹폰트 | **0개** (시스템 폰트만 사용) | 0 |

**원칙**: 모든 비트맵 이미지는 WebP, 모든 벡터는 SVG, PNG는 마스커블 아이콘 단 1개만 예외. JPG/GIF 금지. 새로운 자산 추가 시 PR 게이트에서 거부.

### 17.5.5 코드 (Cache Storage 안에 저장됨)

런타임 코드도 결국 디스크에 캐시되므로 작을수록 좋다.

| 항목 | 정책 | 디스크 영향 |
|---|---|---|
| Route 코드 스플릿 | `React.lazy()` | 미진입 페이지는 디스크 적재 안 됨 |
| Vendor chunk 분리 | react / state / search 분리 | 업데이트 시 변경된 chunk만 교체, 디스크 변동 최소 |
| Tree shaking | ESM only, sideEffects: false | dead code 디스크 적재 0 |
| Polyfill 최소화 | target `es2017` | 추가 polyfill 코드 0 |
| 의존성 선정 | 5KB gzip 미만 우선 | day.js, zustand, idb-keyval, MiniSearch |
| 금지 라이브러리 | moment, lodash, axios, antd, MUI | — |
| CSS | Tailwind purge 엄격 + 미사용 corePlugins off | 최종 CSS raw < 30KB |

### 17.5.6 사용자 가시성 (Storage Transparency)

설정 페이지에서 사용자가 직접 확인·제어 (§6.8 참조):

```
저장공간 사용량
├── 앱 셸          212 KB
├── 학습 콘텐츠    580 KB  (vol1, vol2 캐시됨)
├── 검색 인덱스    200 KB
├── 내 학습 기록    47 KB  (IndexedDB)
└── 총 사용량    1,039 KB
                              [캐시 정리] [전체 초기화]
```

- `navigator.storage.estimate()`로 실시간 측정
- "캐시 정리": Cache Storage만 비움 (IndexedDB 진도는 보존)
- "전체 초기화": IndexedDB 포함 모두 삭제, 첫 진입 상태로

### 17.5.7 디스크 점유 예산 (Storage Budget)

| 상태 | 디스크 점유 (raw) | 게이트 |
|---|---|---|
| 설치만 (앱 셸 only) | ≤ **250 KB** | CI: lighthouse-ci로 SW precache 합산 검증 |
| 전체 학습 + 부록 + 검색 캐시 | ≤ **1.5 MB** | 경고 |
| heavy user IndexedDB | ≤ **100 KB** | 경고 |
| **단말기 총 점유 최대치** | ≤ **2 MB** | 운영 모니터링 |

비교 참고: 폰 사진 1장(JPG) ≈ 2~5MB. 본 앱 전체 = 사진 1장 수준.

### 17.5.8 전송 사이즈 (보조 지표)

디스크 점유와는 별개지만 첫 로드 속도용 보조 예산:

| 리소스 | gzip 한계 |
|---|---|
| 초기 JS | ≤ 100 KB |
| 초기 CSS | ≤ 10 KB |

CI 단계에서 `size-limit`으로 자동 검증.

---

## 18. 개발 단계 (Phase Plan)

### Phase 0 — 스캐폴딩 (1~2일)
- Vite + React + TS + Tailwind + vite-plugin-pwa 초기화
- `build-content.ts` 작성 및 65과 변환 검증
- 라우터 + 빈 페이지 + 하단 탭바
- IndexedDB 헬퍼

### Phase 1 — MVP 기능 구현 (1.5~2주)
- F1: 홈 페이지 (verse of day, continue, vol tiles)
- F2: 목차 페이지 (vol1/2/3 탭)
- F3: 레슨 상세 페이지 (9개 섹션, 표시 모드 토글, 진도 자동저장)
- F4: TTSButton 컴포넌트 + iOS unlock + 보이스 선택
- F5: 검색 페이지 (MiniSearch 통합)
- F6: 플래시카드 페이지 (Leitner 5박스)
- F7: 설정 페이지 (글자크기 포함 전체)
- F8: 부록 뷰어
- F9: PWA manifest + Service Worker + 설치 안내 모달

### Phase 2 — 다듬기 (3~5일)
- 다크모드 마감
- 애니메이션, 빈 상태, 에러 상태
- Lighthouse 점수 ≥ 95 달성
- 실기기 테스트 (iOS, Android 저가폰)

### Phase 3 — 고도화 (옵션)
- 오디오 사전 생성 (Azure/Google TTS → mp3 캐싱)
- 학습 통계 대시보드 (로컬 only, 외부 분석 도구 X)
- (옵션) 로그인 + Firebase 동기화
- **외부 알림 채널**: 카카오톡 채널/오픈채팅 링크를 About 페이지·홈 배너에 노출하여 웹 푸시를 대체. 운영자는 카카오톡으로 새 콘텐츠/공지/이벤트 발송.

---

## 19. 수용 기준 (Acceptance Criteria)

| ID | 기능 | Given | When | Then |
|---|---|---|---|---|
| AC-001 | 콘텐츠 빌드 | Doc/*.md 65개 존재 | `npm run build:content` | lessons.json에 65개 lesson 출력, 각 lesson 9개 섹션 모두 채워짐 |
| AC-002 | 홈 진입 | 첫 방문 | URL 열기 | "오늘의 한 구절" + 권 타일 3개 + 하단 탭바 표시, 첫 콘텐츠 페인트 < 2.5s |
| AC-003 | 이어 학습 | 한 번 이상 레슨 진입 후 종료 | 홈 재진입 | "이어 학습하기" 카드에 마지막 레슨 표시, 탭 시 마지막 스크롤 위치로 복원 |
| AC-004 | 표시 모드 | 레슨 상세 화면 | "한자만" 토글 | 모든 verse 카드에서 병음·한글 숨김, 새로고침해도 설정 유지 |
| AC-005 | TTS 중국어 | zh-CN 보이스 존재 | 🔊 버튼 탭 | 해당 verse 중국어 발음 재생, 재생 중 버튼 시각 피드백 |
| AC-006 | TTS 한국어 | ko-KR 보이스 존재 | 🔊 버튼 길게 누름 | 한국어 번역 발음 재생 |
| AC-007 | TTS 미지원 폴백 | speechSynthesis === undefined | 🔊 버튼 탭 | 토스트 "이 기기는 음성을 지원하지 않습니다" |
| AC-008 | iOS 음성 unlock | iOS Safari 첫 진입 | 아무 버튼 탭 | 이후 🔊 정상 작동 |
| AC-009 | 검색 한자 | 인덱스 빌드 완료 | "爱" 입력 | "爱"가 포함된 verse 결과 ≥ 1개, 매칭 부분 하이라이트 |
| AC-010 | 검색 병음 | 인덱스 빌드 완료 | "ai" 입력 | "ài" 또는 "ai" 포함 verse 결과 표시 |
| AC-011 | 검색 한글 | 인덱스 빌드 완료 | "사랑" 입력 | "사랑" 포함 verse 결과 표시 |
| AC-012 | 플래시카드 추가 | 단어 섹션 카드 표시 | "📥 카드에 추가" 탭 | SRS Box1에 카드 등록, 즉시 "오늘의 복습"에 반영 |
| AC-013 | 플래시카드 SRS | 카드 다음 복습일 도래 | 복습 화면 진입 | 해당 카드 큐에 노출, "쉬움" 선택 시 박스 +1, "어려움" 선택 시 박스 1 |
| AC-014 | 즐겨찾기 | verse 카드 더블탭 | 더블탭 | ⭐ 표시 토글, 영구 저장 |
| AC-015 | 진도 자동 저장 | 레슨 스크롤 70% 도달 | 자동 트리거 | 해당 레슨 "완료" 표시, 목차 ✓ 표시 |
| AC-016 | 오프라인 동작 | 1회 방문 후 SW 설치 완료 | 비행기 모드 + 앱 열기 | 모든 65과 + 검색 정상 동작 |
| AC-017 | PWA 설치 (Android) | Chrome | "설치" 버튼 탭 | 홈화면 아이콘 생성, standalone 모드 실행 |
| AC-018 | PWA 설치 안내 (iOS) | iOS Safari, 3과 이상 학습 | 다음 진입 | "공유 → 홈화면에 추가" 시각 가이드 모달 |
| AC-019 | 글자 크기 | 설정 → 매우 크게 | 적용 | 모든 화면 폰트 1.6× 확대, 레이아웃 깨짐 없음 |
| AC-020 | 다크 모드 | 설정 → 다크 | 적용 | 전체 화면 다크 토큰 적용, 본문 가독성 유지 |
| AC-021 | SW 업데이트 | 새 빌드 배포 후 사용자 재진입 | SW 감지 | 하단 토스트 "새 버전이 있습니다 [업데이트]" |
| AC-022 | Lighthouse | 프로덕션 빌드 | Lighthouse 모바일 측정 | PWA ≥ 95, Performance ≥ 85, Accessibility ≥ 95 |
| AC-023 | 콘텐츠 갱신 | Doc/*.md 한 줄 수정 후 push | 5분 내 사용자 재진입 | 새 내용 노출 (SW 업데이트 토스트 동반) |
| AC-024 | 자동 연속 재생 | 본문 섹션 ▶▶ 탭 | 재생 | verse 순서대로 자동 재생, 설정된 간격 적용, ⏸으로 중단 가능 |
| AC-025 | 부록 뷰어 | 부록 1/2/3 진입 | 진입 | 마크다운 정상 렌더, 표/코드블록 깨짐 없음 |
| AC-026 | Footer 표기 | 모든 페이지 진입 | 페이지 하단 확인 | "© Saemunan Church Mandarin Bible Class. All Rights Reserved." 표시, 하단 탭바와 겹치지 않음 |
| AC-027 | About 페이지 저작권 | About 페이지 진입 | 화면 확인 | 콘텐츠 출처/이용 안내 전문 표시, 무단복제/상업적 이용 금지 문구 포함 |
| AC-028 | 카카오톡 채널 링크 | About 페이지 진입 | "카카오톡으로 공지 받기" 탭 | 새 탭으로 카카오톡 URL 열림 (`rel="noopener"`), URL 미설정 시 안내 표시 |
| AC-029 | 분석 도구 미설치 | 프로덕션 빌드 | 네트워크 탭 검사 | GA/Plausible/기타 외부 트래커 요청 0건 |
| AC-030 | GitHub Pages subpath 동작 | `https://gababayo.github.io/SMCB/` 진입 | 새로고침, 딥링크 (`#/lesson/vol2_03`) | 404 없음, 모든 리소스 정상 로드, SW 등록 성공 |
| AC-031 | **설치 직후 디스크 점유** | PWA 설치 직후 (아무 페이지도 진입 X) | `navigator.storage.estimate()` 측정 | usage ≤ **250 KB** (앱 셸 + meta + 아이콘만) |
| AC-032 | **콘텐츠 lazy cache** | install 후, vol1만 진입 | Cache Storage 검사 | `lessons-vol1.json`만 캐시됨, vol2/vol3/검색인덱스/부록 모두 캐시 0 |
| AC-033 | **전체 사용 시 디스크 점유** | 65과 + 검색 + 부록 전부 사용 | `navigator.storage.estimate()` | usage ≤ **1.5 MB** (raw, 압축 해제 후) |
| AC-034 | **저장공간 표시 UI** | 설정 페이지 진입 | "저장공간 사용량" 섹션 확인 | 앱셸/콘텐츠/검색/IndexedDB 각각 KB 단위 표시, 총합 일치 |
| AC-035 | **캐시 정리 동작** | 설정 → "캐시 정리" 탭 | 확인 후 실행 | Cache Storage 비워짐, IndexedDB(진도·즐겨찾기·SRS) 보존, 디스크 점유 ≤ 250KB로 복귀 |
| AC-036 | **전체 초기화 동작** | 설정 → "전체 초기화" 탭 | 확인 후 실행 | Cache + IndexedDB 모두 삭제, 새 설치 상태로 |
| AC-037 | 웹폰트 미사용 | 프로덕션 빌드 | 네트워크 탭 + Cache Storage | woff/woff2/ttf 요청·캐시 0건, 한자 시스템 폰트로 정상 렌더 |
| AC-038 | 이미지 포맷 | 프로덕션 빌드 | 네트워크 탭 + Cache Storage | PNG는 마스커블 아이콘 1개만, 나머지 이미지·아이콘은 WebP/SVG |
| AC-039 | 자동 캐시 만료 | 캐시된 vol을 90일간 미접근 | 90일 후 (시뮬레이션) | 해당 vol 캐시 evict, 디스크 점유 자동 감소 |
| AC-040 | 임시 아이콘 노출 | PWA 설치 | 홈화면 아이콘 확인 | "SMCB·中" 임시 마크 표시, 정식 로고 교체 시 동일 파일명으로 자동 반영 |

---

## 20. 오픈 이슈 / 후속 결정 (해결됨)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 앱 아이콘 디자인 | ✅ **임시 텍스트 마크 "SMCB·中" 사용**. 새문안교회 로고 허가 확보 시 동일 파일명으로 교체 |
| 2 | 도메인 | ✅ **GitHub Pages 사용** — `https://gababayo.github.io/SMCB/`. 자체 도메인 미사용 |
| 3 | 콘텐츠 라이선스 표기 | ✅ **Footer + About 페이지 두 곳 모두 표기** (§1.4 확정 문구) |
| 4 | 분석 도구 | ✅ **미설치** — 외부 추적 0, 개인정보 처리 0 |
| 5 | PWA 푸시 알림 | ✅ **미사용 → 카카오톡 채널/오픈채팅 링크로 대체** (About 페이지에 노출, 운영자가 카카오톡에서 공지 발송) |

### 남은 운영 항목 (개발 무관, 운영자 준비)
- 카카오톡 채널/오픈채팅 URL 확정 → `app/src/config.ts`에 한 줄 추가
- 새문안교회 정식 로고 사용 허가 확보 시점 → 임시 아이콘 교체

---

## 21. 변경 이력

| 날짜 | 버전 | 변경 |
|---|---|---|
| 2026-05-18 | v1.0 | 초안 작성, MVP 4기능 + 큰글씨 + 완전공개 확정 |
| 2026-05-18 | v1.1 | GitHub Pages 배포 확정(`/SMCB/` subpath, HashRouter), 웹폰트 미사용, 이미지 WebP/SVG, 콘텐츠 vol별 chunk 분할, §17.5 용량 최소화 전략 신설, S-009 About 페이지 추가, Footer 의무화, 카카오톡 채널로 푸시 대체, 분석 도구 미설치 확정, 임시 아이콘 정책, AC-026~035 추가, 모든 오픈 이슈 해결 |
| 2026-05-18 | v1.2 | **§17.5 관점 재정의**: "전송 사이즈 다이어트" → "**단말기 디스크 점유 최소화**"로 초점 변경. install 시 precache를 앱 셸+meta만으로 축소(약 200KB), 콘텐츠는 진입 시 lazy cache, 90일 자동 만료, IndexedDB 슬림화. §6.8 설정에 "저장공간 사용량"·"캐시 정리"·"전체 초기화" UI 추가. §10.1 SW 전략을 precache-all → lazy-cache로 전환. 디스크 예산: 설치만 ≤ 250KB, 전체 사용 ≤ 1.5MB. AC-031~036 디스크 점유 검증으로 교체, AC-039 자동 만료 추가 |
