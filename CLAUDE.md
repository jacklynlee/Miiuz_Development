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
  triggers. The app only uses `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (via `api/config.mjs`).
  Jacklyn's Vercel ↔ Supabase integration also stores server-only secrets in Vercel Production
  (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_*`).
  **Never read them in app code, never send them to the browser, never copy them elsewhere.**
- **AI:** Claude via `@anthropic-ai/sdk` in `api/chat.mjs` and `api/translate.mjs`. The default
  model is `claude-opus-5-5`, which `MIIUZ_MODEL` overrides. Prompts and the `update_plan` tool
  live in `js/prompt.js`.
- **Analytics:** Vercel Web Analytics through the script tag at the end of `index.html` (plain HTML
  needs no `@vercel/analytics` package). Its `beforeSend` strips sign-in tokens and invite codes from
  the address. Never send personal data (emails, names, member ids) to it.
- **PWA:** `sw.js` + `manifest.webmanifest`. When you add or rename a front-end file, update the
  `<script>` list in `index.html` and the service worker's cached file list.
- **No CDNs:** MapLibre, the Supabase client and the Latin fonts are copied into `vendor/` and
  `fonts/` by `npm run vendor` (pinned versions in `scripts/vendor.mjs`). Never load scripts or
  fonts from a CDN or Google Fonts: they're blocked or unreliable in mainland China (#18). Chinese,
  Japanese and Korean text uses the phone's own fonts.

## Commands

```bash
npm install
npm run dev            # http://localhost:3000, AI features off
npm run dev:env        # uses .env (ANTHROPIC_API_KEY) for AI chat + translation
npm run check          # syntax, data and translation checks: run before every commit
npm run build:preview  # single-file claude.ai preview
npm run translate -- ms zh-Hant   # bundle AI translations into locales/<code>.json
npm run vendor         # refresh vendor/ and fonts/ from npm (pinned versions)
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

- **Branches:**
  - `main` = **live**: Vercel production, https://www.miiuz-bb.com (`miiuz-bb.com` and the old
    `miiuz-bb.vercel.app` redirect there).
  - `staging` = **pre-production**: the fixed staging web address, where releases are tested.
  - Both are long-lived and protected. Never push to them directly.
- **Everyday work:** branch from `staging` (`feature/…`, `fix/…`, `claude/…`) and open the PR **to
  `staging`**, never straight to `main`.
- **Going live:** only through a release PR `staging` → `main` (see Cutting a release).
- **Urgent live bug (hotfix):** branch from `main`, PR to `main`, then open a PR `main` →
  `staging` so staging gets the fix too.
- Merged branches are deleted. The commits stay in `main` and `staging`, and the PR page keeps
  the full record (with a "Restore branch" button).
- **One database:** staging and live share the single live Supabase project
  (`dldriviphcluivceluqy`).
  - Anything done on staging (sign-ups, points) is real. Test with own or team accounts only.
  - Database changes must be additive (new tables or columns). Never rename or drop anything
    `main` still uses.
  - Claude only reads from Supabase unless Sze Yee explicitly OKs a change. Schema changes go
    through `supabase/schema.sql` in a PR.
- Tickets are GitHub Issues in this repo, using the templates in `.github/ISSUE_TEMPLATE/`.
  Reference the issue in the PR (`Fixes #12`).
- Labels: type (`bug`, `enhancement`, `content`, `documentation`), area (`area: …`) and
  priority (`P1`, `P2`, `P3`).

## Releases and milestones

Versions follow semantic versioning, **MAJOR.MINOR.PATCH**, judged by what travellers notice.

| Change | Bump | Example |
|---|---|---|
| Fix only: bug, wrong fact or price, typo, translation fix | PATCH: 1.0.0 → 1.0.1 | Wrong KLIA Ekspres fare |
| New feature or improvement, nothing existing breaks | MINOR: 1.0.1 → 1.1.0 | Stays page |
| Breaks or replaces something users already have or know (saved data lost, sign up again, navigation redesigned, relaunch) | MAJOR: 1.4.2 → 2.0.0 | Members must re-register |

- A release's number is set by its biggest change. Lots of features is still MINOR. Only a
  breaking change makes a MAJOR. Bumping one number resets those to its right to 0.
- **One GitHub milestone per release**, named `vX.Y.Z – short name` (e.g. `v1.1.0 – Stays`).
  `Future release` is the unversioned backlog: wanted, not yet scheduled.
- Every open issue has a milestone. When you file one:
  - Fix (`bug`, `content`): the release currently in progress if it isn't out yet, otherwise
    the next PATCH milestone (create it if missing).
  - Feature (`enhancement`): the next MINOR milestone it's planned for, or `Future release`.
  - Anything with the `breaking change` label: the next MAJOR milestone only.
  - Unsure: `Future release`, and say so in the issue.
- A PR goes in the same milestone as the issue it fixes (`Fixes #12`) and states its change
  type in the PR template. Repo or process PRs with no issue need no milestone.
- Don't move issues between numbered milestones without Sze Yee's OK.
- `package.json` `version` is the last released version (`0.9.0` = before the first release).

### Cutting a release (when every issue in its milestone is closed)

1. In a PR to `staging`, set `package.json` `version` to the milestone's version.
2. Open the **release PR** `staging` → `main`, titled `Release vX.Y.Z`, in the milestone. Its body
   is this checklist, tested on the staging web address:
   - [ ] Every issue in the milestone is closed
   - [ ] `npm run check` passes
   - [ ] Phone-size screen, light and dark mode, plus one RTL language (e.g. العربية)
   - [ ] EN, 简体中文, 한국어, 日本語 read correctly on changed screens
   - [ ] Ask Miiuz answers, Members sign-in works, SOS numbers and the share-location link work
   - [ ] Offline: reload with the network off and the app still opens
   - [ ] Facts changed in this release are checked against official sources
3. Merge it (merge commit, not squash), then tag `main`: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. Create a GitHub Release from the tag, with generated release notes.
5. Close the milestone, and create the next one if it doesn't exist.
6. Check https://www.miiuz-bb.com is updated and works.

- History before this repo: the app was first built in the `mybb-app/` folder of
  `jacklynlee/Github` and moved here with its history on 2026-11-03.
