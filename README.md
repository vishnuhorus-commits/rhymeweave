# RhymeWeave V2 • Stable Base

**RhymeWeave V2 Stable PWA** — A professional writing flow checker for rhymes, alliteration, phrase chains, and prompts.

## ✨ Features

- **Live Writing Flow Checker** — Real-time alliteration and rhyme highlighting
- **Word Finder** — 4-level rhyme search (perfect → family → texture → experimental)
- **Phrase Chain Builder** — Create linked word chains in multiple styles
- **Alliteration Generator** — Auto-generate alliterative lines by letter
- **Prompt Creator** — Generate writing prompts from saved words
- **Review Sorter** — Approve, reject, or hold words for review
- **Offline Support** — Service worker caches everything for offline use
- **Local Saving** — Browser storage keeps all work automatically
- **Export Tools** — Export as CSV, TXT, or JSON

## 🚀 Live Deployment

**Now hosted at:** `https://vishnuhorus-commits.github.io/rhymeweave`

### How to Use on iPad

1. Open the link in **Safari**
2. Tap **Share** button
3. Tap **Add to Home Screen**
4. Name it `RhymeWeave`
5. Tap **Add**

It's now a full app on your home screen with offline support.

## 📁 Files

- `index.html` — Main app (all UI + JavaScript)
- `service-worker.js` — Offline caching
- `manifest.json` — PWA configuration
- `icon-192.png` — App icon (small)
- `icon-512.png` — App icon (large)

## 🔄 Version Strategy

**V2 = Stable Base** ✅
- Airtight rhyme finder + alliteration analyzer
- Phrase chains + prompt generation
- Review sorter with local storage
- Zero breaking changes planned

Future versions (V3, V4) will **layer new features** on top without breaking V2's core.

## 🛠️ Key Features Deep Dive

### Live Writer
Paste or write text. The app auto-detects:
- **Alliteration groups** — Words starting with the same letter
- **Rhyme-like endings** — Words with matching suffixes

### Finder
Search by 4 rhyme levels using Datamuse API:
1. **Perfect** — Exact rhyme matches
2. **Family** — Close partner rhymes
3. **Texture** — Assonance & consonance
4. **Experimental** — Near-rhymes & loose suggestions

### Chains
Build connected word phrases. Generate outputs in 5 styles:
- Linked phrase chain
- Poetic sentence
- Cinematic line
- Mythic line
- Rap/hook

### Review System
Sort words into 4 status categories:
- ✅ **Approved** — Strong, usable words
- 🟡 **Maybe** — Potential, needs context
- 🔵 **Needs Review** — Uncertain, save for later
- ❌ **Rejected** — Weak or irrelevant

All data is saved locally to browser. Export anytime.

## 🔌 Offline JSON Loader

For **Level 1 (Perfect Rhyme)** searches, you can load a CMUdict-based `rhymes.json` file for fully offline perfect rhyme lookups (no API call needed).

## 📝 Local Development

No build step. Just:
1. Clone the repo
2. Open `index.html` in a browser
3. Everything works offline + with service worker

## 🐛 Known Limits

- Rhyme levels 2–4 require internet (Datamuse API)
- Service worker caches assets only, not API responses
- Icons must be placed manually (192x192 and 512x512 PNG)

## 🎯 Roadmap

**V2** ✅ Stable — Rhyme finder + alliteration + chains + review
**V3** (future) — Image prompt creator, divine word filter
**V4** (future) — Advanced flow analysis, nested categories

---

**Made with Tailwind CSS + Datamuse API + Service Workers**