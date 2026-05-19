# SMCB — Saemunan Mandarin Bible Class PWA

A Progressive Web App for learning Chinese (Mandarin) through the Bible.
Built for the Saemunan Church Mandarin class, optimized for mobile, offline-capable, and bilingual (中文 ↔ 한국어).

> 한국어 안내는 [README_KR.md](README_KR.md) 를 참고하세요.

---

## ✨ Features

- **Verse-by-verse lessons** with per-character Pinyin ruby alignment
- **Built-in TTS** (Microsoft Edge Neural Voices, pre-rendered at build time → offline `.mp3`)
- **Vocabulary cards** with 简体 / 拼音 / 词性 / 뜻 / 한자풀이 / 예문 (6-field)
- **Apostles' Creed & Lord's Prayer** appendix pages with the same lesson UX
- **Favorites** (verse / vocab / vocab example) — composite key per lesson
- **Search** across all lessons & appendices (MiniSearch)
- **Installable PWA** with offline caching (Workbox)
- **Theme & font scaling** in Settings

---

## 📨 Installation Invitation

Use this snippet when sharing the app with class members:

```
Saemunan Church Mandarin Bible Class PWA

📖 SMCB — Mandarin Bible Learning App

Built on Beijing Standard Mandarin (普通话), with natural everyday Chinese expressions.
Install once and use it offline anywhere, anytime — no internet required.

Open the link below in your mobile or PC browser (Chrome / Safari / Edge).
👉 https://mykim711231.github.io/SMCB/?openExternalBrowser=1

[How to Install]
• Android : Menu (︙) → "Add to Home screen"
• iPhone  : Share (⬆) → "Add to Home Screen"
• PC (Windows/Mac) : Click the install icon (⊕) at the right end of the Chrome/Edge address bar → "Install"

After installation, every lesson and pronunciation (TTS) is available offline.
May we share the joy of learning together in the Lord. 🙏
```

---

## 🧱 Tech Stack

| Layer       | Tool                                   |
|-------------|----------------------------------------|
| Build       | Vite 5                                 |
| UI          | React 18 + TypeScript 5                |
| Styling     | Tailwind CSS 3                         |
| State       | Zustand 4 (+ idb-keyval persistence)   |
| Routing     | React Router 6 (HashRouter)            |
| Search      | MiniSearch 7                           |
| TTS         | msedge-tts (zh-CN-XiaoxiaoNeural)      |
| PWA         | vite-plugin-pwa + Workbox 7            |

---

## 📁 Repository Layout

```
SMCB/
├── Doc/                    # Markdown source (lessons, appendices)
│   ├── vol1/ vol2/ vol3/   # Volume 1 ~ 3 lessons
│   ├── 附录1_…              # Appendix 1: Pinyin Table
│   ├── 附录2_…              # Appendix 2: Tone Sandhi
│   ├── 附录3_使徒信经.md      # Apostles' Creed
│   └── 附录4_主祷文.md        # Lord's Prayer
├── app/                    # Vite + React app
│   ├── scripts/            # build-content / build-search / build-tts
│   ├── src/                # components, pages, stores, lib
│   └── public/tts/         # Pre-rendered .mp3 (committed)
└── .github/workflows/
    └── deploy.yml          # GitHub Pages deploy
```

---

## 🚀 Quick Start

```bash
cd app
npm ci
npm run dev           # localhost:5173 — auto rebuilds content + index
```

Production build & preview:

```bash
npm run build         # build:all → tsc → vite build
npm run preview       # serves dist/ at /SMCB/ base
```

---

## ✍️ Content Authoring

Lessons and appendices use a small set of placeholders inside Markdown:

| Placeholder                                              | Meaning                                       |
|----------------------------------------------------------|-----------------------------------------------|
| `{{tts:中文}}`                                            | Inline speaker button                         |
| `{{verse:zh\|pinyin\|ko}}`                                | One verse row (hanzi+ruby pinyin / Korean)    |
| `{{vocab:word\|pinyin\|meaning}}`                         | Compact vocab item (3-field)                  |
| `{{vocab:word\|pinyin\|pos\|meaning\|hanjaNote\|exZh\|exPinyin\|exKo}}` | Full vocab card (8-field) |

`npm run build:all` regenerates `app/src/data/*.json` from the Markdown.
`npm run build:tts` synthesizes any missing `.mp3` to `app/public/tts/`.

---

## ✅ Testing (Unit / Verification)

This project does **not** ship a Jest/Vitest suite. The verification pipeline is:

```bash
cd app
npm run typecheck     # tsc -b --noEmit  (strict TS check on all files)
npm run build         # full content + search + Vite production build
npm run preview       # smoke-test the built app at http://localhost:4173/SMCB/
```

When changing content or lesson UI, manually verify:

1. `/lesson/vol1_01` renders verses with per-character pinyin
2. Speaker button plays TTS (offline after first load)
3. Favorites (verse / vocab / vocab example stars) persist across reload
4. `/appendix/3` (使徒信经) and `/appendix/4` (主祷文) render with the lesson layout

CI runs `npm ci → build:all → build` on every push to `main` (see `.github/workflows/deploy.yml`).
If the build is green, type-checks and bundling already passed.

---

## 🌐 Deployment

The app is hosted under **mykim711231/SMCB** on GitHub Pages.
Two remotes are configured:

```
origin → https://github.com/gababayo/SMCB.git    (development)
mykim  → https://github.com/mykim711231/SMCB.git (production / Pages)
```

### Standard release flow

```bash
# 1. Push to your fork (review / backup)
git push origin main

# 2. Push to the production remote — triggers GitHub Pages deploy
git push mykim main
```

GitHub Actions (`Deploy PWA to GitHub Pages`) automatically:
1. Checks out the repo
2. Installs deps (`npm ci`)
3. Builds content + search index (`npm run build:all`)
4. Builds the PWA (`npm run build`)
5. Copies `index.html → 404.html` (SPA fallback)
6. Uploads artifact & deploys to `mykim711231.github.io/SMCB/`

### Manually re-running the workflow

If you need to redeploy **without** a new commit (e.g. after a Pages settings change):

**Option A — GitHub UI**
1. Open https://github.com/mykim711231/SMCB/actions
2. Select **Deploy PWA to GitHub Pages**
3. Click **Run workflow** → branch `main` → **Run workflow**

**Option B — GitHub CLI**
```bash
gh workflow run "Deploy PWA to GitHub Pages" --repo mykim711231/SMCB --ref main
gh run watch --repo mykim711231/SMCB
```

The deployed site appears at:
**https://mykim711231.github.io/SMCB/**

---

## 📜 License & Credits

- Content: Mandarin Bible class materials, Saemunan Church
- Code: Internal / unlicensed (contact maintainer for reuse)
- TTS voice: Microsoft Edge Neural (zh-CN-XiaoxiaoNeural) — synthesized offline at build time
