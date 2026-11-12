# Miiuz Beyond Borders (Miiuz BB / MyBB)

**Cuti-cuti Malaysia!** A travel companion web app for tourists who have just arrived in a new
country. It starts with **Malaysia**: hand-written day plans for Kuala Lumpur, Penang and Melaka,
20 more destinations from Langkawi to Kuching, and search for any place in the country. It is
built so more countries can be added.

Live at **https://www.miiuz-bb.com**. 

It grew out of the original *Miiuz Beyond Borders* half-day planner artifact: the planner is
still here, now alongside everything else a visitor needs.

## What's inside

| Tab | What it does |
|---|---|
| **Home** | "Cuti-cuti Malaysia!", search box, local time vs. your phone, live exchange rate, this month's weather, one-tap 999, "just landed" shortcuts, a link to Explore, checklist progress |
| **Explore** | A map of Malaysia with 23 destinations, photo strips of destinations, food to try and souvenirs to buy, and when to go (weather, festivals). Search and place pages belong to this tab (#49) |
| **Our Pick!** (Explore, city pages, search) | Food places the Miiuz team visited and recommends, listed with the owner's consent: what to order and for how much, halal status, open now, how to pay, the owner's photos, directions and the driver card (#50). Listings live in Supabase, so staff add them without a release |
| **Search** | Type to search the app's own places, guide, dishes, souvenirs and phrases instantly (offline, in every language); press Search to find *any* place in Malaysia on OpenStreetMap |
| **Place pages** | Photo, what it is (plus a Wikipedia summary in the traveller's language), opening hours / phone / website where known, street map, directions (Google Maps, Waze), "show the driver" card, distance from your city or from you, nearby Miiuz picks and destinations, nearby hospitals / police / ATMs, one-tap questions for Miiuz |
| **Guide** | Photo galleries of 11 must-try dishes and 12 souvenirs, and 12 topics: entry & MDAC, airport transfers, money & payments, getting around, SIM & internet, food, etiquette, safety & scams, weather & packing, health, shopping, festivals. Facts checked October 2026 |
| **Plan** | The day planner from the original artifact: pick city, time window (or work back from a flight), travel style, interests, group and budget; get a route with travel times, map links and ticket links. It can start and end the day at the hotel in My trip |
| **My trip** (`#trip`, from Plan and Home) | Stays and car tours the traveller booked anywhere (Agoda, Booking.com, Airbnb, Klook…), typed in by hand: dates, address, booking reference, driver, car, guide. Home shows today's stay and tour, SOS shows their numbers, the driver card follows the current hotel, place pages show the distance from it. Kept on the phone, and in the account for members (#5) |
| **Tools** | Currency converter (live rates), bill splitter (10% service + 6% SST), "show the driver" hotel card, Malay phrasebook with audio and full-screen "show" mode, trip checklist |
| **Ask Miiuz** (`#ask`, switched off until #13, no tab) | AI travel assistant on Claude: answers in the traveller's language, searches the web for current prices/hours, cites sources, and can rewrite the day plan on screen |
| **SOS** (header) | Emergency numbers (999 / 112 / 994 / tourist police / consular lines), share my location, nearest hospitals & police, saved hotel & embassy numbers |
| **Members** (header) | Free membership: +10 points for joining, +10 per invited friend, Basic → Silver → Gold → Platinum tiers, member-only offers, goodies and news |

Works offline after the first visit (installable PWA, with an "install the app" card on Home), in
light and dark mode, on phones and desktops. Everything is free for guests.

### Updates

Travellers get each deployment without reinstalling (`sw.js`, `js/update.js`, #30):

- **Which version:** `/api/config` returns `version` (from `package.json`) and `build` (the
  deployment's commit, `dev` locally). Credits shows the version the phone is running, e.g.
  "Version 1.0.0 (abc1234)", with a **Check for updates** button. That tells staging from live,
  and answers "which version do you have?".
- **One version at a time:** the service worker is registered as `sw.js?v=<build>`. Each build
  stores all its app files in its own cache when it installs, and serves them from there, so a page
  never mixes files from two versions. There's no cache version to bump by hand. Locally
  (`v=dev`), files are fetched from the network first, so edits show on reload.
- **Noticing a new version:** when the app comes back to the foreground, and every 3 hours, it asks
  `/api/config` again. A new build installs in the background, then a bar says "A new version of
  Miiuz BB is ready · Update". It waits while the traveller is typing or the SOS sheet is open.
  Update reloads, and saved data (language, home country, plans, sign-in) stays. A traveller who
  ignores it gets the new version the next time the app starts.
- **Forcing an update:** set `MIIUZ_MIN_VERSION` (e.g. `1.0.1`) in Vercel and redeploy. Older
  copies then show a full-screen "Please update", still with a 999 button, and the APIs answer
  them `426`. Use it only for breaking API changes or wrong safety facts (SOS numbers, entry
  rules), never for normal releases, and remove it afterwards.
- **Old copies and the API:** the app sends its version as `X-Miiuz-Version`. Change request
  formats so the previous release keeps working.
- **Saved data:** settings and plans are `mbb.*` in localStorage, with `mbb.dataVersion`. A
  release that changes a saved format raises `DATA_VERSION` in `js/core.js` and adds a step
  that converts old data.
- Offline, nothing is checked: the app opens on the last version it had.

## Languages (i18n)

Languages use BCP 47 tags (`js/locales.js`); numbers, dates and currencies are formatted with
the browser's `Intl` APIs for the chosen locale, and Arabic, Persian, Hebrew and Urdu switch the
layout to right-to-left. The phone's language is detected on first open.

**Home country is separate from language** (`js/country.js`). Language follows the phone; the
home country decides the currency, date and time formats (English + US → `en-US`, 12-hour
time), units (miles and °F for the US, metric in brackets) and country facts (content marked
`for: ["US"]`: visa, embassy and STEP, payments and tipping, plugs, customs at home, "Malaysia's
911" in SOS). It's guessed without permission prompts, strongest first: a member's nationality, the phone's time zone (if not Malaysia's), the
request's country from Vercel (`/api/config`, if not Malaysia), the region in the phone's
language settings, then the language's usual country. Home asks once ("Home country: United
States? Yes · Change"); the choice is saved on the phone and can be changed from Home.

**Prices follow the home currency.** Content and strings write prices as plain ringgit
(`RM55`, `RM1–RM10`, `RM30–100`, `RM100+`) in every language, and the app adds the home-currency
amount after each one: "RM55 (≈ US$14)", "RM55（约 ¥93）". It uses the live rate when online and
the saved one offline, rounds it (≈), adds nothing for travellers whose home currency is the
ringgit, and updates in place when the rate or home country changes. In code, render any text that
may contain a price with `MBB.priceHtml(text)` instead of `esc(text)` (`js/core.js`).

- **Hand-translated:** English, 简体中文, 한국어, 日本語 — interface and all content. Country facts
  (visa rules, payment apps, consular help, plugs and voltage, customs back home) follow the home
  country, not the language: each line is marked `for: ["US"]` and written in all four languages,
  so an American reading Korean gets the US lines in Korean.
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
   - `MIIUZ_MIN_VERSION` to force older copies to update (rarely; see Updates)
4. Check that AI is on: open `https://your-app/api/chat`. It must say `"configured":true`. If it
   says `false`, the key is missing from that environment, or you haven't redeployed since adding
   it (a new variable only reaches new deployments).
5. Visitor numbers (optional): in Vercel → **Analytics**, press **Enable**, then redeploy. The
   script tag is already at the end of `index.html`; no npm package is needed for a plain HTML
   site. It's cookieless and anonymous (page, referrer, country, device and browser). The page
   strips sign-in tokens and invite codes from the address before anything is sent. Until it's
   enabled, `/_vercel/insights/script.js` returns 404, which does no harm. Mention it in the
   privacy notice.

### Domain and email

- **Live address:** https://www.miiuz-bb.com (Vercel production, branch `main`). `miiuz-bb.com`
  and the old `miiuz-bb.vercel.app` redirect there (308), so old links and the QR code in
  `marketing/` keep working.
- **DNS** is at GoDaddy. Vercel → Settings → Domains shows the records each address needs.
- **Staging** gets its own fixed address (for example `staging.miiuz-bb.com`): add it in Vercel →
  Settings → Domains, assign it to the Git branch `staging`, and add the CNAME record Vercel shows.
- **Email:** sign-in codes are sent by Supabase through Resend, from `hello@miiuz-bb.com` (see
  Membership → Set up, step 5). Resend's records (`resend._domainkey`, plus MX and TXT on `send`)
  are in the same GoDaddy DNS.
- If you set `MIIUZ_ALLOWED_ORIGINS`, list every address the app is opened from, e.g.
  `https://www.miiuz-bb.com,https://staging.miiuz-bb.com`. Addresses that only redirect don't
  need to be listed.

Without the key, everything except the AI assistant and AI translation works. Travellers see
"Ask Miiuz isn't available right now", and the browser console says why.

## Membership (Supabase)

Guests can use the whole app. Members sign in with a 6-digit code emailed to them (no
password) and get:

- **+10 points** when they join, and **+10 points** for every friend who joins with their
  invite link (`https://your-app/?ref=CODE`). The friend gets their own +10 too.
- **Details at sign-up:** nationality (required), and optionally a phone number (with a
  WhatsApp/SMS offers opt-in) and an emergency contact, which members can call in one tap from
  the SOS screen. National ID and passport numbers are deliberately **not** collected. Members
  can view and edit their details any time; already-registered members use the **Sign in** tab.
- **Tiers** by points ever earned: Basic (0) → Silver (1,000) → Gold (5,000) → Platinum (10,000).
  Spending points never lowers a tier, and neither points nor tiers expire.
- **Member offers, goodies and news**, optionally limited to a tier and above.

Guests are invited to join after 5 minutes of use, then again after 10, 20, 40 minutes (at most
hourly), never while typing. Until Supabase is connected, membership is hidden and nobody is nudged.

Points are written only by the database (triggers in `supabase/schema.sql`), after the email
address is verified, once per person; members can read but never change their own points.

**My trip** bookings (#5) are kept in the `trip_bookings` table, so they're on every device a
member signs in on. Only that member can read, add, change or delete them, and they're removed
with the account. Guests' bookings stay on their phone. Bookings never earn points.

**Our Pick!** listings (#50) are in the `our_picks` table, readable by everyone; see
[Our Pick! listings](#our-pick-listings-staff) below for how staff add them.

### Set up (once)

1. Create a project at [supabase.com](https://supabase.com) (region: Southeast Asia / Singapore).
2. **SQL Editor** → paste all of `supabase/schema.sql` → Run. Safe to run again: after any
   update to the file (such as the member-details columns), run it again to upgrade.
3. **Authentication → URL Configuration**: Site URL `https://www.miiuz-bb.com`; add redirect
   URLs `https://www.miiuz-bb.com/**`, the staging address (e.g. `https://staging.miiuz-bb.com/**`)
   and `http://localhost:3000/**`.
4. **Authentication → Emails → Templates**: in both **Confirm signup** and **Magic Link**, add
   the Miiuz BB sign-in emails (#28):
   - **Confirm signup**: paste all of `supabase/email/confirm-signup.html` into the body.
   - **Magic Link**: paste all of `supabase/email/magic-link.html`.
   - Subject for both: `{{ .Token }} · Miiuz BB`, so phones can offer the code without opening
     the email. If it arrives with `{{ .Token }}` written out, use `Your Miiuz BB code` instead.
   - The code comes first: it works everywhere, including the installed app on iPhone, where the
     link opens Safari instead. Emails are in EN, 简体中文, 한국어 or 日本語 from the member's
     language (`lang`, saved when they join and when they change language), English otherwise.
   - The emails say the code works for 1 hour: keep **Email OTP Expiration** (Sign In / Providers
     → Email) at 3600 seconds, or change the text.
   - To change the wording, edit `scripts/build-emails.mjs`, run `npm run emails`, and paste
     again. Keep click tracking off at the email sender: it rewrites the sign-in link.
5. **Authentication → Emails → SMTP Settings**: connect a real email sender (e.g. Resend, Brevo,
   Amazon SES). Supabase's built-in sender only delivers to your own team's addresses and a few
   emails per hour, so real members won't receive codes without this. Miiuz uses Resend: host
   `smtp.resend.com`, port 465, username `resend`, password a Resend API key with sending access
   for `miiuz-bb.com` only, sender `hello@miiuz-bb.com`, sender name `Miiuz Beyond Borders`.
6. **Project Settings → API**: copy the **Project URL** and the **publishable** key (or legacy
   `anon` key). In Vercel → Environment Variables add `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`), then redeploy. These two are meant to be
   public. If you connect Supabase through Vercel's integration it also adds secret keys
   (service_role, JWT secret, Postgres password) to Vercel; the app never uses them. Never read
   them in app code or put them in the browser.

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
select p.display_name, u.email, p.nationality, p.language, p.marketing_opt_in_at
from profiles p join auth.users u on u.id = p.id
where p.marketing_opt_in and u.email_confirmed_at is not null
order by p.created_at;

-- Members who agreed to WhatsApp/SMS offers
select p.display_name, p.phone, p.nationality, p.sms_opt_in_at
from profiles p join auth.users u on u.id = p.id
where p.sms_opt_in and p.phone is not null and u.email_confirmed_at is not null;

-- Members by nationality
select coalesce(nationality, '(not given)') as nationality, count(*) from profiles group by 1 order by 2 desc;

-- Top inviters
select u.email, count(*) as friends
from points_ledger l join auth.users u on u.id = l.user_id
where l.reason = 'referral' group by u.email order by friends desc limit 20;
```

Marketing emails and WhatsApp/SMS offers go only to members who ticked the opt-in boxes
(unticked by default); members can change them any time. Malaysia's PDPA expects a privacy
notice in Malay and English that says what you collect and why; have one reviewed before
launching membership. Phone numbers and emergency contacts are visible only to the member
and to you (the Supabase project owner).

### Our Pick! listings (staff)

Food places the Miiuz team visited and recommends (#50). They show in Explore, on their city's
page and in search, and each has its own page (`#place-pick-<slug>`). Everyone sees live
listings, guests too. The app reads them through `/api/picks`, which Vercel caches for 5 minutes,
and keeps the last ones on the phone for offline use.

**Collect in one visit:**
- The owner's **written consent** to be listed and to use their photos. Keep the signed form, and
  note where in `consent_note` (staff only: the app can't read it).
- Name, address, opening hours and days closed; 2–3 dishes to order with prices; the price range
  per person; how to pay (`cash`, `duitnow`, `card`, `alipay`, `wechat`).
- **Halal status, from the certificate.** Only JAKIM or a state Islamic authority (JAWI in KL)
  can certify, and calling an uncertified place halal is against the law. Use `certified` with
  the issuer and expiry date, `no_pork` if there's no pork or lard but no certificate, otherwise
  `not_halal`. The app stops saying "halal" after `halal_expires`, so update it when the
  certificate is renewed.
- If the place pays, or gets anything in return, tick `sponsored`: the app then says "Sponsored".

**Add it:**
1. **Photos:** Storage → `our-picks` → upload JPEG or WebP, about 1600 px wide and under 2 MB,
   named like `kedai-contoh-1.webp` (lower case, no spaces). To replace a photo, upload it under a
   new name: phones keep photos they've already seen.
2. **Listing:** Table Editor → `our_picks` → Insert row, or SQL (the example is made up):
   ```sql
   insert into our_picks (slug, name, area, address, lat, lng, blurb, dishes, price_range,
     halal, halal_body, halal_expires, hours, hours_note, pay, phone, photos, photo_credit,
     consent_on, consent_note, checked_on)
   values ('kedai-contoh', 'Kedai Contoh', 'Kampung Baru', 'Jalan Raja Muda Musa, Kampung Baru, 50300 Kuala Lumpur',
     3.1650, 101.7004,
     '{"en": "Why we like it, in one or two sentences.", "zh": "…", "ko": "…", "ja": "…"}',
     '[{"ms": "Nasi lemak ayam goreng", "en": "Coconut rice with fried chicken", "zh": "炸鸡椰浆饭", "ko": "…", "ja": "…", "price": "RM12"}]',
     'RM8–RM15', 'certified', 'JAKIM', '2027-06-30', 'Mo-Sa 07:00-15:00; Su off',
     '{"en": "Closed on public holidays", "zh": "…", "ko": "…", "ja": "…"}',
     '{cash,duitnow}', '+60 3-0000 0000', '["kedai-contoh-1.webp", "kedai-contoh-2.webp"]', 'Kedai Contoh',
     '2026-11-20', 'Signed form: Drive → Our Pick! → Kedai Contoh.pdf', '2026-11-20');
   ```
   - **Text** (`blurb`, dish names, `hours_note`) in EN, 简体中文, 한국어 and 日本語; other languages
     are translated from English automatically. `names` holds the name in other scripts, e.g.
     `{"zh": "…"}`. Prices are plain ringgit.
   - **Hours** use OpenStreetMap's short form: `Mo-Sa 07:00-15:00; Su off`, a break
     `Tu-Su 07:00-11:30,17:00-22:00`, past midnight `Mo-Su 18:00-02:00`, or `24/7`. Days not named
     are closed. The database refuses anything it can't read, and the other checks (halal
     certificate, photo names, a location in Malaysia).
   - **Location:** right-click the entrance in Google Maps to copy its latitude and longitude.
3. **Check, then approve:** a second person checks the listing against the notes and photos, then
   ticks `approved`. It can't be approved without `consent_on`. It appears within 5 minutes.
   Untick `active` to hide it for a while; `sort` orders the list (lower first).
4. **Recheck** each place at least every 6 months and update `checked_on` (the app shows the month).

## Search, maps and photos

- **Search anywhere** uses OpenStreetMap's Nominatim through `api/places.mjs`, limited to
  Malaysia. Nominatim's free service allows about one request a second and no
  search-as-you-type, so the app searches only when the traveller presses Search, the function
  spaces requests out, and Vercel caches answers for a week. If traffic grows, sign up for a
  Nominatim-compatible service (e.g. LocationIQ) and set `MIIUZ_GEOCODER_URL` /
  `MIIUZ_GEOCODER_KEY`.
- **Summaries** come from Wikipedia in the traveller's language when that edition has the
  article (CC BY-SA, credited on the page).
- **Photos** come from Wikimedia Commons, with the author and licence on every photo and on the
  **Photo & map credits** page (footer). Every destination, place, dish and souvenir has a
  **reviewed photo pinned** in `photos.pin` (`js/data/malaysia.explore.js`, #32):
  - **Requirements:** a free licence, no personality-rights or trademark flag, the actual subject,
    and taken in Malaysia.
  - **Licences:** CC BY, CC BY-SA, CC0, public domain, and Commons' "Attribution" and
    "Copyrighted free use". Not GFDL-only, NC or ND.
  - **Pin first:** `/api/media` uses the pin first and reads its author and licence from Commons, so
    a Wikipedia edit can't swap in a wrong photo.
  - **Fallbacks:** without a usable pin, it uses the lead photo of the article titles (`wp`), then
    their Wikidata image (P18). Logos, maps and files in `photos.avoid` are skipped.
  - **Changing one:** pin a new file after checking its Commons page. The first title gives the
    place page its Wikipedia summary.
  - **Before each release, run `npm run photos`** (it needs the network). It lists items with no
    photo, items not pinned, pins that stopped working (deleted or relicensed), and titles that
    are missing or disambiguation pages. `npm run check` makes sure every item is pinned.
  - **Through our own domain:** the app loads every photo through `/api/photo` (`api/photo.mjs`,
    #39), because Wikimedia is blocked in mainland China and on Chinese roaming SIMs. It only
    fetches Commons photos (JPEG, PNG, WebP, GIF), and Vercel's CDN keeps each one for a year.
  - **Offline:** photos the traveller has seen are kept (at most 200, about 12 MB).
  - **Updates:** the app asks for the photo list again after it updates, otherwise every 3 days.
  - **Our Pick! is the one exception** (#50): those are the owner's own photos, used with their
    written permission and credited to the place. They're in Supabase Storage → `our-picks` and
    load through `/api/photo?pick=<file>`, which only fetches from that bucket.
- **Maps**: the Malaysia overview is drawn offline from Natural Earth (public domain;
  rebuild with `scripts/build-map.mjs`). Street maps use MapLibre GL (our own copy in `vendor/`)
  with OpenFreeMap tiles (free, no key, © OpenStreetMap contributors) and fall back to the
  overview plus a Google Maps link when offline. Travellers from China also get Amap (高德) and
  Baidu Maps links on place pages and in the day plan, since Google is blocked on Chinese SIMs.
- **Fonts and third-party scripts**: nothing loads from Google Fonts or a CDN, so the app works
  from mainland China (#18). Latin text uses Noto Sans, Noto Serif and IBM Plex Mono from `fonts/`
  (SIL Open Font License); Chinese, Japanese and Korean use the phone's own fonts. MapLibre and
  the Supabase client are in `vendor/`. `npm run vendor` refreshes both from npm at the versions
  pinned in `scripts/vendor.mjs`.
- **WeChat**: links and the poster's QR code often open in WeChat's in-app browser, which can't
  install apps. There the app shows a bar explaining how to open it in the phone's browser, and
  Share copies the link instead.

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
css/fonts.css · fonts/  self-hosted Latin fonts (generated by npm run vendor)
vendor/                 MapLibre GL and the Supabase client (npm run vendor)
js/data/malaysia.js     country pack: cities, places, guide, phrases, emergency, checklist (zh + en)
js/data/malaysia.ko.js  Korean pack      js/data/malaysia.ja.js  Japanese pack
js/i18n.js              interface strings      js/locales.js   language list (BCP 47)
js/country.js           home country: detection, currency, 12-hour countries, country list
js/core.js              state, storage, helpers, icons
js/translate.js         on-demand AI translation    js/i18n-entries.js  translatable string inventory
js/ai.js                where AI runs (server / Claude artifact / off)
js/prompt.js            assistant + translation prompts, update_plan tool
js/explore.js · guide.js · planner.js · tools.js · chat.js · app.js   the screens
js/trip.js              My trip: stays and car tours, kept on the phone and in members' accounts
js/data/malaysia.explore.js  destinations, souvenirs, states, city summaries, photo titles and pins
js/data/malaysia.map.js      Malaysia outline for the offline map (generated)
js/search.js · place.js      search and place pages      js/maps.js  overview + street maps
js/media.js             photos with credits, credits page
js/picks.js             Our Pick!: listings from /api/picks, open now, halal status, cards and place pages
js/member.js            membership: sign-in by emailed code, details, points, tiers, invites, offers, nudges
js/install.js           "install the app" card (Android prompt / iPhone instructions), WeChat bar
js/update.js            version, update bar and "Please update" (with sw.js)
api/chat.mjs · api/translate.mjs   Vercel functions (Claude API)
api/config.mjs          hands the public Supabase URL + key and the visitor's country to the app
api/places.mjs · api/media.mjs   place search and Wikipedia/Commons lookups (cached)
api/picks.mjs           live Our Pick! listings from Supabase (cached 5 minutes)
api/photo.mjs           Commons and Our Pick! photos through our own domain, for travellers in China (#39)
supabase/email/         sign-in emails for Supabase (generated by scripts/build-emails.mjs: npm run emails)
supabase/schema.sql     membership database: tables, points triggers, tiers, access rules
sw.js · manifest.webmanifest · icons/   PWA (offline, one cache per build)
scripts/                check, translate, build-preview, vendor
locales/                bundled AI translations
marketing/              QR code (SVG/PNG) and A5 poster (PNG/PDF) for https://miiuz-bb.vercel.app/ (redirects to www.miiuz-bb.com)
```

Rebuild the single-file claude.ai preview with `npm run build:preview`.

## Content notes

Facts were checked in October 2026 (visa rules, MDAC, KLIA Ekspres fares, SST, payments,
emergency numbers). Rules and prices change; the app tells travellers to confirm with
official sources. Update `checked` in `js/data/malaysia.js` when you re-verify.

---

© 2026 Miiuz Beyond Borders Sdn. Bhd. All rights reserved. See [LICENSE](LICENSE).
