# Miiuz Beyond Borders (Miiuz BB / MyBB)

A travel companion web app for tourists who have just arrived in a new country. It starts
with **Malaysia** (Kuala Lumpur, Penang, Melaka) and is built so more countries can be added.

It grew out of the original *Miiuz Beyond Borders* half-day planner artifact: the planner is
still here, now alongside everything else a visitor needs.

## What's inside

| Tab | What it does |
|---|---|
| **Home** | Local time vs. your phone, live exchange rate, this month's weather, one-tap 999, "just landed" shortcuts, checklist progress |
| **Guide** | 12 topics: entry & MDAC, airport transfers, money & payments, getting around, SIM & internet, food, etiquette, safety & scams, weather & packing, health, shopping, festivals. Facts checked October 2026 |
| **Plan** | The day planner from the original artifact: pick city, time window (or work back from a flight), travel style, interests, group and budget; get a route with travel times, map links and ticket links |
| **Tools** | Currency converter (live rates), bill splitter (10% service + 6% SST), "show the driver" hotel card, Malay phrasebook with audio and full-screen "show" mode, trip checklist |
| **Ask Miiuz** | AI travel assistant on Claude: answers in the traveller's language, searches the web for current prices/hours, cites sources, and can rewrite the day plan on screen |
| **SOS** (header) | Emergency numbers (999 / 112 / 994 / tourist police / consular lines), share my location, nearest hospitals & police, saved hotel & embassy numbers |

Works offline after the first visit (installable PWA), in light and dark mode, on phones and desktops.

## Languages (i18n)

Languages use BCP 47 tags (`js/locales.js`); numbers, dates and currencies are formatted with
the browser's `Intl` APIs for the chosen locale, and Arabic, Persian, Hebrew and Urdu switch the
layout to right-to-left. The phone's language is detected on first open.

- **Hand-translated:** English, 简体中文, 한국어, 日本語 — interface and all content, with
  facts adapted per audience (visa rules, payment apps, consular hotline, plug/voltage).
- **39 more languages** (繁體中文, 粵語, Bahasa Melayu, Indonesia, ไทย, Tiếng Việt, Filipino, हिन्दी,
  தமிழ், العربية, Français, Deutsch, Español, Русский …): picked from the language menu and
  translated by Miiuz AI the first time, then saved on that phone. English shows while it loads.

To ship a language pre-translated (no wait, no per-user AI cost), bundle it:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run translate -- ms zh-Hant th id
```

This writes `locales/<code>.json`; commit it. To add a new language, add a line to
`js/locales.js`. To hand-translate one fully, copy `js/data/malaysia.ko.js` as a template
and add UI strings to `js/i18n.js`.

## Run it locally

```bash
npm install
npm run dev            # http://localhost:3000 (AI features off)
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run dev:env        # with the AI assistant and AI translation on
npm run check          # syntax + data + translation sanity checks
```

## Deploy (Vercel)

1. Import this repository in Vercel (no build step needed; it's a static site plus two functions).
2. In **Project Settings → Environment Variables**, add `ANTHROPIC_API_KEY`.
3. Deploy. Optional variables (see `.env.example`):
   - `MIIUZ_MODEL` (default `claude-opus-5-5`)
   - `MIIUZ_ALLOWED_ORIGINS` to only accept AI requests from your own domain (recommended)
   - `MIIUZ_RATE_LIMIT` / `MIIUZ_TRANSLATE_LIMIT` per-IP request limits

Without the key, everything except the AI assistant and AI translation works.

## How the AI parts work

- `api/chat.mjs` streams answers from Claude (`claude-opus-5-5`) with a fixed system prompt
  (`js/prompt.js`), the web search tool, and an `update_plan` tool that the page executes
  itself. Server-side refusal fallback is enabled (`fallbacks: "default"`).
- The browser keeps the conversation and sends it back each turn **without editing earlier
  turns** (Claude's reasoning is tied to the exact history); long chats end with "New chat".
- `api/translate.mjs` translates batches of the app's English strings with structured JSON
  output; only languages listed in `js/locales.js` are accepted.
- When the app is opened as a claude.ai artifact, both features use the viewer's own Claude
  account instead (no web search there).

## Project layout

```
index.html              app shell
css/app.css             styles (design tokens, light/dark, per-script fonts, RTL)
js/data/malaysia.js     country pack: cities, places, guide, phrases, emergency, checklist (zh + en)
js/data/malaysia.ko.js  Korean pack      js/data/malaysia.ja.js  Japanese pack
js/i18n.js              interface strings      js/locales.js   language list (BCP 47)
js/core.js              state, storage, helpers, icons
js/translate.js         on-demand AI translation    js/i18n-entries.js  translatable string inventory
js/ai.js                where AI runs (server / Claude artifact / off)
js/prompt.js            assistant + translation prompts, update_plan tool
js/guide.js · planner.js · tools.js · chat.js · app.js   the screens
api/chat.mjs · api/translate.mjs   Vercel functions (Claude API)
sw.js · manifest.webmanifest · icons/   PWA
scripts/                check, translate, build-preview
locales/                bundled AI translations
```

Rebuild the single-file claude.ai preview with `npm run build:preview`.

## Content notes

Facts were checked in October 2026 (visa rules, MDAC, KLIA Ekspres fares, SST, payments,
emergency numbers). Rules and prices change; the app tells travellers to confirm with
official sources. Update `checked` in `js/data/malaysia.js` when you re-verify.
