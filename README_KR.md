# SMCB — 새문안 중국어 성경반 PWA

새문안교회 중국어 성경반을 위한 학습용 Progressive Web App 입니다.
모바일 최적화 · 오프라인 지원 · 한·중 이중언어(中文 ↔ 한국어)로 구성되어 있습니다.

> English README: [README.md](README.md)

---

## ✨ 주요 기능

- **구절별 학습** — 한 글자씩 정렬되는 병음(루비) 표시
- **내장 TTS** — Microsoft Edge Neural 음성을 빌드 시점에 미리 합성하여 오프라인 `.mp3` 로 제공
- **주요 어휘 카드** — 简体 / 拼音 / 词性 / 뜻 / 한자풀이 / 예문 (6필드)
- **부록 — 사도신경 / 주기도문** 도 본문과 동일한 학습 UX 적용
- **즐겨찾기** (구절 / 어휘 / 어휘 예문) — 레슨별 복합 키로 저장
- **전문 검색** — 모든 본문과 부록 (MiniSearch)
- **PWA 설치** — Workbox 기반 오프라인 캐싱
- **설정** — 테마 / 글자 크기 / 병음 루비 표시

---

## 📨 설치 초청 메시지

반원분들께 공유할 때 아래 메시지를 그대로 사용하시면 됩니다.

```
새문안교회 중국어 성경반 PWA 안내

📖 SMCB — 중국어 성경 학습 앱

아래 링크를 휴대폰 또는 PC 브라우저(Chrome / Safari / Edge)에서 열어 주세요.
👉 https://mykim711231.github.io/SMCB/

[설치 방법]
• Android : 메뉴(︙) → "홈 화면에 추가"
• iPhone  : 공유(􀈂) → "홈 화면에 추가"
• PC (Windows/Mac) : Chrome/Edge 주소창 오른쪽 끝의 설치 아이콘(⊕) 클릭 → "설치"

설치하시면 오프라인에서도 모든 본문과 발음(TTS)을 들을 수 있습니다.
주님 안에서 함께 배우는 기쁨이 있기를 바랍니다. 🙏
```

---

## 🧱 기술 스택

| 영역        | 도구                                   |
|-------------|----------------------------------------|
| 빌드        | Vite 5                                 |
| UI          | React 18 + TypeScript 5                |
| 스타일      | Tailwind CSS 3                         |
| 상태관리    | Zustand 4 (+ idb-keyval 영속화)        |
| 라우팅      | React Router 6 (HashRouter)            |
| 검색        | MiniSearch 7                           |
| TTS         | msedge-tts (zh-CN-XiaoxiaoNeural)      |
| PWA         | vite-plugin-pwa + Workbox 7            |

---

## 📁 저장소 구조

```
SMCB/
├── Doc/                    # 원본 Markdown (본문 + 부록)
│   ├── vol1/ vol2/ vol3/   # 1~3권 본문
│   ├── 附录1_…              # 부록 1: 병음표
│   ├── 附录2_…              # 부록 2: 성조 변화
│   ├── 附录3_使徒信经.md      # 사도신경
│   └── 附录4_主祷文.md        # 주기도문
├── app/                    # Vite + React 앱
│   ├── scripts/            # build-content / build-search / build-tts
│   ├── src/                # components, pages, stores, lib
│   └── public/tts/         # 미리 합성된 .mp3 (커밋됨)
└── .github/workflows/
    └── deploy.yml          # GitHub Pages 배포
```

---

## 🚀 빠른 시작

```bash
cd app
npm ci
npm run dev           # localhost:5173 — content + index 자동 재빌드
```

프로덕션 빌드 & 미리보기:

```bash
npm run build         # build:all → tsc → vite build
npm run preview       # /SMCB/ base 로 dist/ 서빙
```

---

## ✍️ 콘텐츠 작성 규칙

본문과 부록 Markdown 안에서 사용하는 플레이스홀더입니다.

| 플레이스홀더                                             | 의미                                          |
|----------------------------------------------------------|-----------------------------------------------|
| `{{tts:中文}}`                                            | 인라인 스피커 버튼                            |
| `{{verse:zh\|pinyin\|ko}}`                                | 구절 한 줄 (한자+병음 루비 / 한국어)          |
| `{{vocab:word\|pinyin\|meaning}}`                         | 간단 어휘 항목 (3필드)                        |
| `{{vocab:word\|pinyin\|pos\|meaning\|hanjaNote\|exZh\|exPinyin\|exKo}}` | 전체 어휘 카드 (8필드)        |

`npm run build:all` 실행 시 Markdown → `app/src/data/*.json` 으로 재생성됩니다.
`npm run build:tts` 는 누락된 `.mp3` 만 `app/public/tts/` 에 합성합니다.

---

## ✅ 단위 테스트 방법

본 프로젝트는 Jest/Vitest 스위트를 포함하지 않습니다. 다음 절차로 검증합니다.

```bash
cd app
npm run typecheck     # tsc -b --noEmit  (모든 파일 strict 타입 검사)
npm run build         # 콘텐츠 + 검색 + Vite 프로덕션 빌드
npm run preview       # http://localhost:4173/SMCB/ 에서 스모크 테스트
```

콘텐츠 또는 레슨 UI 를 변경한 경우 다음을 수동으로 확인합니다.

1. `/lesson/vol1_01` — 한 글자씩 정렬된 병음이 보이는지
2. 스피커 버튼 — TTS 가 정상 재생되는지 (최초 로딩 후 오프라인 동작)
3. 즐겨찾기 — 구절/어휘/어휘 예문 별이 새로고침 후에도 유지되는지
4. `/appendix/3` (使徒信经) 및 `/appendix/4` (主祷文) — 본문과 동일한 레이아웃인지

`main` 브랜치 push 시마다 CI 가 `npm ci → build:all → build` 를 실행합니다 (`.github/workflows/deploy.yml`).
빌드가 초록불이면 타입 검사와 번들링이 이미 통과된 상태입니다.

---

## 🌐 mykim711231 에 배포하는 방법

이 앱은 **mykim711231/SMCB** GitHub Pages 에 호스팅됩니다.
원격 저장소는 2개로 구성되어 있습니다.

```
origin → https://github.com/gababayo/SMCB.git    (개발/백업)
mykim  → https://github.com/mykim711231/SMCB.git (프로덕션 / Pages)
```

### 표준 릴리스 순서

```bash
# 1. 개발용 fork 로 push (리뷰/백업)
git push origin main

# 2. 프로덕션 원격으로 push — GitHub Pages 배포 자동 실행
git push mykim main
```

GitHub Actions (`Deploy PWA to GitHub Pages`) 가 자동으로 다음을 수행합니다.
1. 저장소 체크아웃
2. 의존성 설치 (`npm ci`)
3. 콘텐츠 + 검색 인덱스 빌드 (`npm run build:all`)
4. PWA 빌드 (`npm run build`)
5. `index.html → 404.html` 복사 (SPA fallback)
6. 아티팩트 업로드 후 `mykim711231.github.io/SMCB/` 로 배포

### 워크플로우 수동 재실행 (runworkflow) 방법

새 커밋 없이 재배포가 필요한 경우 (예: Pages 설정 변경 후) 다음 중 하나를 사용합니다.

**방법 A — GitHub 웹 UI**
1. https://github.com/mykim711231/SMCB/actions 접속
2. 좌측 목록에서 **Deploy PWA to GitHub Pages** 선택
3. 우측 **Run workflow** 버튼 → 브랜치 `main` 선택 → **Run workflow** 클릭

**방법 B — GitHub CLI**
```bash
gh workflow run "Deploy PWA to GitHub Pages" --repo mykim711231/SMCB --ref main
gh run watch --repo mykim711231/SMCB
```

배포된 사이트 주소:
**https://mykim711231.github.io/SMCB/**

---

## 📜 라이선스 & 크레딧

- 콘텐츠: 새문안교회 중국어 성경반 학습 자료
- 코드: 내부용 / 비공개 (재사용 문의는 메인테이너에게)
- TTS 음성: Microsoft Edge Neural (zh-CN-XiaoxiaoNeural) — 빌드 시 오프라인 합성
