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
| **Members** (header) | Free membership: +10 points for joining, +10 per invited friend, Basic → Silver → Gold → Platinum tiers, member-only offers, goodies and news |

Works offline after the first visit (installable PWA, with an "install the app" card on Home), in
light and dark mode, on phones and desktops. Everything is free for guests.

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

## Membership (Supabase)

Guests can use the whole app. Members sign in with a 6-digit code emailed to them (no
password) and get:

- **+10 points** when they join, and **+10 points** for every friend who joins with their
  invite link (`https://your-app/?ref=CODE`). The friend gets their own +10 too.
- **Tiers** by points ever earned: Basic (0) → Silver (1,000) → Gold (5,000) → Platinum (10,000).
  Spending points never lowers a tier, and neither points nor tiers expire.
- **Member offers, goodies and news**, optionally limited to a tier and above.

Guests are invited to join after 5 minutes of use, then again after 10, 20, 40 minutes (at most
hourly), never while typing. Until Supabase is connected, membership is hidden and nobody is nudged.

Points are written only by the database (triggers in `supabase/schema.sql`), after the email
address is verified, once per person; members can read but never change their own points.

### Set up (once)

1. Create a project at [supabase.com](https://supabase.com) (region: Southeast Asia / Singapore).
2. **SQL Editor** → paste all of `supabase/schema.sql` → Run. (Safe to run again after updates.)
3. **Authentication → URL Configuration**: Site URL `https://miiuz-bb.vercel.app`; add redirect
   URLs `https://miiuz-bb.vercel.app/**` and `http://localhost:3000/**`.
4. **Authentication → Emails → Templates**: in both **Confirm signup** and **Magic Link**, add
   the code, e.g. `<h2>Your Miiuz BB code: {{ .Token }}</h2>`, above the existing link.
5. **Authentication → Emails → SMTP Settings**: connect a real email sender (e.g. Resend, Brevo,
   Amazon SES). Supabase's built-in sender only delivers to your own team's addresses and a few
   emails per hour, so real members won't receive codes without this.
6. **Project Settings → API**: copy the **Project URL** and the **publishable** key (or legacy
   `anon` key). In Vercel → Environment Variables add `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`), then redeploy. These two are meant to be
   public; never put the `service_role` / secret key in Vercel or the app.

### Everyday admin (Supabase → SQL Editor or Table Editor)

```sql
-- Post an offer for Silver and above (title/body per language; missing languages fall back to English)
insert into member_offers (kind, min_tier, title, body, code, link, ends_at) values
  ('offer', 'silver',
   '{"en": "15% off Penang food tour", "zh": "槟城美食团 85 折", "ko": "페낭 푸드 투어 15% 할인", "ja": "ペナン屋台ツアー15%オフ"}',
   '{"en": "Show this code when you book."}',
   'MIIUZ15', 'https://partner.example.com', '2026-12-31');
-- kind: 'offer' | 'goodie' | 'news'. Hide one early: update member_offers set active = false where id = 1;

-- Give bonus points (also counts towards tiers)
insert into points_ledger (user_id, points, reason, note)
select id, 500, 'adjustment', 'Merdeka bonus' from auth.users where email = 'member@example.com';

-- Record points spent on a reward (lowers the balance, not the tier)
insert into points_ledger (user_id, points, reason, note)
select id, -1000, 'redeem', 'Free cendol voucher' from auth.users where email = 'member@example.com';

-- Change a tier threshold
update member_tiers set min_points = 2000 where tier = 'silver';

-- Members who agreed to marketing emails (for your newsletter tool)
select p.display_name, u.email, p.language, p.marketing_opt_in_at
from profiles p join auth.users u on u.id = p.id
where p.marketing_opt_in and u.email_confirmed_at is not null
order by p.created_at;

-- Top inviters
select u.email, count(*) as friends
from points_ledger l join auth.users u on u.id = l.user_id
where l.reason = 'referral' group by u.email order by friends desc limit 20;
```

Marketing emails go only to members who ticked the opt-in box (unticked by default); each
member can change it any time under **Account**.

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
js/member.js            membership: sign-in by emailed code, points, tiers, invites, offers, nudges
js/install.js           "install the app" card (Android prompt / iPhone instructions)
api/chat.mjs · api/translate.mjs   Vercel functions (Claude API)
api/config.mjs          hands the public Supabase URL + key to the app
supabase/schema.sql     membership database: tables, points triggers, tiers, access rules
sw.js · manifest.webmanifest · icons/   PWA
scripts/                check, translate, build-preview
locales/                bundled AI translations
marketing/              QR code (SVG/PNG) and A5 poster (PNG/PDF) for https://miiuz-bb.vercel.app/
```

Rebuild the single-file claude.ai preview with `npm run build:preview`.

## Content notes

Facts were checked in October 2026 (visa rules, MDAC, KLIA Ekspres fares, SST, payments,
emergency numbers). Rules and prices change; the app tells travellers to confirm with
official sources. Update `checked` in `js/data/malaysia.js` when you re-verify.

---

© 2026 Miiuz Beyond Borders Sdn. Bhd. All rights reserved. See [LICENSE](LICENSE).
