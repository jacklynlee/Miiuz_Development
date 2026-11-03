# Miiuz BB (Miiuz Beyond Borders): notes for Claude

Travel companion web app for tourists arriving in a new country, starting with Malaysia
("Cuti-cuti Malaysia!"). Owned by Miiuz Beyond Borders Sdn. Bhd. Development and PRs are
handled by Sze Yee; the repo and Vercel account belong to Jacklyn (`jacklynlee`).

README.md is the full product and setup guide. Read it before larger changes.

## Stack at a glance

- **No framework, no build step.** Plain HTML/CSS and classic `<script>` files loaded in order
  from `index.html` (they share globals through `window`). Do not convert to ES modules,
  a bundler or a framework unless asked.
- **Vercel functions** in `api/*.mjs` (Node ≥ 20). Files starting with `_` are shared helpers,
  not endpoints. Function limits live in `vercel.json`.
- **Local dev server:** `server.mjs` serves the static files and the `api/` handlers.
- **Membership:** Supabase (`supabase/schema.sql`). Points are only ever written by database
  triggers. Never put the `service_role` key in the app or in Vercel.
- **AI:** Claude via `@anthropic-ai/sdk` in `api/chat.mjs` and `api/translate.mjs`. The default
  model is `claude-opus-5-5`, which `MIIUZ_MODEL` overrides. Prompts and the `update_plan` tool
  live in `js/prompt.js`.
- **PWA:** `sw.js` + `manifest.webmanifest`. When you add or rename a front-end file, update the
  `<script>` list in `index.html` and the service worker's cached file list.

## Commands

```bash
npm install
npm run dev            # http://localhost:3000, AI features off
npm run dev:env        # uses .env (ANTHROPIC_API_KEY) for AI chat + translation
npm run check          # syntax, data and translation checks: run before every commit
npm run build:preview  # single-file claude.ai preview
npm run translate -- ms zh-Hant   # bundle AI translations into locales/<code>.json
```

## Where things live

- Content: `js/data/malaysia.js` (zh + en), `malaysia.ko.js`, `malaysia.ja.js`,
  `malaysia.explore.js` (destinations, souvenirs, photo article titles `wp`).
- UI strings: `js/i18n.js`. Language list (BCP 47): `js/locales.js`.
- Screens: `js/guide.js`, `planner.js`, `tools.js`, `chat.js`, `search.js`, `place.js`,
  `member.js`, `app.js` (routing by `#hash`: home, guide, plan, tools, ask, search, place,
  member, credits).

## Rules for changes

- Hand-translated languages are English, 简体中文, 한국어 and 日本語. A user-facing text change
  must update all four. Other languages are AI-translated from English automatically.
- Keep RTL (Arabic, Persian, Hebrew, Urdu), light/dark mode, offline use and phone layouts
  working.
- Facts (visas, MDAC, fares, SST, emergency numbers) must be accurate. When you re-verify them,
  update `checked` in `js/data/malaysia.js`.
- Photos must be freely licensed (Wikimedia Commons) with credits shown. Never hot-link
  unlicensed images.
- Never commit `.env` or any API key. Secrets belong in Vercel → Environment Variables.
- Personal data: national ID and passport numbers are deliberately not collected. Keep it that
  way (Malaysia PDPA).

## Git and tickets

- Work on a feature branch and open a PR to `main`. `main` is meant to be the production branch
  on Vercel (project `miiuz-bb`, https://miiuz-bb.vercel.app).
- Tickets are GitHub Issues in this repo, using the templates in `.github/ISSUE_TEMPLATE/`.
  Reference the issue in the PR (`Fixes #12`).
- Labels: type (`bug`, `enhancement`, `content`, `documentation`), area (`area: …`) and
  priority (`P1`, `P2`, `P3`).
- History before this repo: the app was first built in the `mybb-app/` folder of
  `jacklynlee/Github` and moved here with its history on 2026-11-03.
