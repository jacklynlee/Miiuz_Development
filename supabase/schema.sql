-- Miiuz Beyond Borders — membership, points, member offers, My trip bookings and Our Pick! listings.
-- Run once in Supabase → SQL Editor → New query → paste all → Run. Safe to run again.
--
-- Points rules (change the numbers in award_join_points if needed):
--   +10 for the new member, once their email is verified
--   +10 for the member whose invite link they used
-- Points are written only by the database itself; the app can read a member's own
-- points but can never add or change them. To award points by hand (a promotion, a
-- purchase), add a row to points_ledger with reason 'adjustment'.
--
-- Tiers (table member_tiers; edit min_points there): Basic 0, Silver 1,000,
-- Gold 5,000, Platinum 10,000 — based on points ever earned, so a tier never drops.
-- Points and tiers don't expire.

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  referral_code text unique not null,
  referred_by uuid references public.profiles (id) on delete set null,
  display_name text check (char_length(display_name) <= 60),
  language text,
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  created_at timestamptz not null default now()
);
-- Details members give when they join: nationality (the app requires it), and optionally a
-- phone number and an emergency contact (shown in the app's SOS screen). Phone numbers are
-- stored in international form (+ country code, digits only). National ID and passport
-- numbers are deliberately not collected.
alter table public.profiles add column if not exists nationality text check (nationality ~ '^[A-Z]{2}$');
alter table public.profiles add column if not exists phone text check (phone ~ '^\+[0-9]{7,15}$');
alter table public.profiles add column if not exists sms_opt_in boolean not null default false;
alter table public.profiles add column if not exists sms_opt_in_at timestamptz;
alter table public.profiles add column if not exists emergency_name text check (char_length(emergency_name) <= 80);
alter table public.profiles add column if not exists emergency_relation text check (char_length(emergency_relation) <= 40);
alter table public.profiles add column if not exists emergency_phone text check (emergency_phone ~ '^\+[0-9]{7,15}$');

create table if not exists public.points_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  points integer not null,
  reason text not null check (reason in ('signup', 'referral', 'adjustment', 'redeem')),
  related_user uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists points_one_signup on public.points_ledger (user_id) where reason = 'signup';
create unique index if not exists points_one_referral_per_friend on public.points_ledger (related_user) where reason = 'referral';
create index if not exists points_by_user on public.points_ledger (user_id, created_at desc);

create table if not exists public.member_tiers (
  tier text primary key check (tier in ('basic', 'silver', 'gold', 'platinum')),
  rank smallint not null unique,
  min_points integer not null check (min_points >= 0)
);
insert into public.member_tiers (tier, rank, min_points) values
  ('basic', 0, 0), ('silver', 1, 1000), ('gold', 2, 5000), ('platinum', 3, 10000)
on conflict (tier) do nothing;

-- Member-only offers, goodies and news. Add rows in Table Editor → member_offers.
-- title / body are per language, e.g. {"en": "Free cendol", "zh": "免费煎蕊", "ko": "...", "ja": "..."}
-- min_tier limits an offer to that tier and above (basic = every member).
create table if not exists public.member_offers (
  id bigint generated always as identity primary key,
  kind text not null default 'offer' check (kind in ('offer', 'goodie', 'news')),
  min_tier text not null default 'basic' references public.member_tiers (tier),
  title jsonb not null,
  body jsonb not null default '{}'::jsonb,
  code text,
  link text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- My trip (#5): a member's stays and car tours, so they're on every device the member signs in
-- on. Only that member can read or change them. Guests' bookings stay on their phone. `details`
-- holds only the fields the app shows (js/trip.js); passport and ID numbers are never asked for.
-- The app writes updated_at (newest edit wins when two devices change the same booking).
-- These bookings never earn points (#8).
create table if not exists public.trip_bookings (
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('stay', 'tour')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192),
  starts_on date not null,
  ends_on date,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists trip_bookings_by_user on public.trip_bookings (user_id, starts_on);

-- Our Pick! (#50): food places the Miiuz team visited and recommends, listed with the owner's
-- written consent. Staff add rows in Table Editor → our_picks (README → Our Pick!). Everyone,
-- guests too, can read live picks (approved and active) through /api/picks.
-- Text in four languages is {"en": "...", "zh": "...", "ko": "...", "ja": "..."}; other languages
-- are AI-translated from English. Prices are plain ringgit ("RM8–RM15").
-- Opening hours use OpenStreetMap's short form: "Mo-Sa 07:00-15:00; Su off", "Mo-Su 18:00-02:00",
-- "Tu-Su 07:00-11:30,17:00-22:00", "24/7". A later rule wins for the days it names.
create or replace function public.valid_opening_hours(h text) returns boolean
language sql immutable as $$
  select h ~ ('^(24/7|' || r || '(; ?' || r || ')*)$')
  from (select d || '(-' || d || ')?(,' || d || '(-' || d || ')?)* (off|' || t || '-' || t || '(,' || t || '-' || t || ')*)' as r
        from (select '(Mo|Tu|We|Th|Fr|Sa|Su)'::text as d, '([01][0-9]|2[0-4]):[0-5][0-9]'::text as t) parts) rule;
$$;

create table if not exists public.our_picks (
  id bigint generated always as identity primary key,
  -- the page address: #place-pick-<slug>, e.g. "nasi-lemak-wanjo"
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  city text not null default 'kl' check (city ~ '^[a-z]{2,20}$'),
  name text not null check (length(name) between 1 and 120),        -- as on the signboard
  names jsonb not null default '{}'::jsonb check (jsonb_typeof(names) = 'object'), -- the name in other scripts, e.g. {"zh": "..."}
  area text check (length(area) <= 60),                              -- neighbourhood, e.g. "Kampung Baru"
  address text not null check (length(address) <= 300),
  lat double precision not null check (lat between 0.8 and 7.5),
  lng double precision not null check (lng between 99.5 and 119.5),
  blurb jsonb not null check (jsonb_typeof(blurb) = 'object' and blurb ? 'en'), -- why we picked it, 1–2 sentences
  -- what to order, 1–5 dishes: [{"ms": "Nasi lemak ayam goreng", "en": "Coconut rice with fried chicken", "zh": "...", "ko": "...", "ja": "...", "price": "RM12"}]
  dishes jsonb not null default '[]'::jsonb check (jsonb_typeof(dishes) = 'array' and jsonb_array_length(dishes) <= 5
    and not jsonb_path_exists(dishes, '$[*] ? (@.type() != "object" || !exists(@.en))')),
  price_range text check (price_range ~ '^RM[0-9]'),               -- per person, e.g. "RM8–RM15"
  -- Only JAKIM or a state Islamic religious authority can certify halal (Trade Descriptions Act 2011).
  -- Never call an uncertified place halal: 'no_pork' = no pork or lard, but not certified.
  halal text not null check (halal in ('certified', 'no_pork', 'not_halal')),
  halal_body text check (length(halal_body) <= 40),                  -- who certified it: JAKIM, JAWI, JAIS…
  halal_expires date,                                                -- from the certificate; the app stops saying "halal" after it
  hours text check (public.valid_opening_hours(hours)),
  hours_note jsonb not null default '{}'::jsonb check (jsonb_typeof(hours_note) = 'object'), -- e.g. {"en": "Closed on public holidays"}
  pay text[] not null default '{}' check (pay <@ array['cash', 'duitnow', 'card', 'alipay', 'wechat']),
  phone text check (length(phone) <= 24),
  -- file names in Storage → our-picks, first one is the cover: ["nasi-lemak-wanjo-1.webp", ...]
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 8
    and not jsonb_path_exists(photos, '$[*] ? (@.type() != "string" || !(@ like_regex "^[a-z0-9][a-z0-9._-]{0,80}[.](jpg|jpeg|png|webp)$"))')),
  photo_credit text check (length(photo_credit) <= 80),              -- shown on every photo, e.g. "Nasi Lemak Wanjo"
  sponsored boolean not null default false,  -- true if the place pays or gets anything in return: the app says "Sponsored"
  consent_on date,                           -- the day the owner signed consent to be listed and to use their photos
  consent_note text,                         -- where the signed form is kept (staff only, never sent to the app)
  checked_on date not null default current_date, -- the day the details were last checked with the place
  approved boolean not null default false,   -- a second person checked the listing
  active boolean not null default true,      -- untick to hide it for a while
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint our_picks_certified_needs_certificate check (halal <> 'certified' or (halal_body is not null and halal_expires is not null)),
  constraint our_picks_approved_needs_consent check (not approved or consent_on is not null)
);

-- Photos for Our Pick!: the owner's own photos, used with their written permission and credited.
-- Upload in Storage → our-picks (JPEG, PNG or WebP, up to 2 MB, about 1600 px wide). The app loads
-- them through /api/photo on our own domain.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('our-picks', 'our-picks', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------- points ----------
create or replace function public.new_referral_code() returns text
language plpgsql set search_path = public as $$
declare c text;
begin
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.profiles where referral_code = c);
  end loop;
  return c;
end $$;

create or replace function public.award_join_points(member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inviter uuid;
begin
  insert into public.points_ledger (user_id, points, reason) values (member, 10, 'signup')
    on conflict do nothing;
  select referred_by into inviter from public.profiles where id = member;
  if inviter is not null and inviter <> member then
    insert into public.points_ledger (user_id, points, reason, related_user) values (inviter, 10, 'referral', member)
      on conflict do nothing;
  end if;
end $$;
revoke execute on function public.award_join_points(uuid) from public, anon, authenticated;

-- New account: create the profile and remember who invited them (points wait for verification).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  code text := upper(trim(coalesce(meta ->> 'ref', '')));
  wants_news boolean := coalesce(meta ->> 'marketing', '') = 'true';
  nat text := upper(coalesce(meta ->> 'nationality', ''));
  inviter uuid;
begin
  if code <> '' then
    select id into inviter from public.profiles where referral_code = code;
  end if;
  insert into public.profiles (id, referral_code, referred_by, display_name, language, marketing_opt_in, marketing_opt_in_at, nationality)
  values (new.id, public.new_referral_code(), inviter,
          nullif(left(trim(coalesce(meta ->> 'name', '')), 60), ''),
          nullif(left(coalesce(meta ->> 'lang', ''), 16), ''),
          wants_news, case when wants_news then now() end,
          case when nat ~ '^[A-Z]{2}$' then nat end)
  on conflict (id) do nothing;
  if new.email_confirmed_at is not null then
    perform public.award_join_points(new.id);
  end if;
  return new;
end $$;

-- Email verified (the member entered the emailed code or tapped the link): award points.
create or replace function public.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.award_join_points(new.id);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();
-- Trigger functions are only for the triggers above, never for the app's API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;

-- Keep a record of when someone agreed to (or stopped) receiving offers by email or WhatsApp/SMS.
create or replace function public.stamp_opt_in() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.marketing_opt_in is distinct from old.marketing_opt_in then
    new.marketing_opt_in_at := case when new.marketing_opt_in then now() end;
  end if;
  if new.sms_opt_in is distinct from old.sms_opt_in then
    new.sms_opt_in_at := case when new.sms_opt_in then now() end;
  end if;
  return new;
end $$;
drop trigger if exists profiles_stamp_opt_in on public.profiles;
create trigger profiles_stamp_opt_in before update on public.profiles
  for each row execute function public.stamp_opt_in();

-- Our Pick!: when a listing was last changed.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists our_picks_touch on public.our_picks;
create trigger our_picks_touch before update on public.our_picks
  for each row execute function public.touch_updated_at();

-- ---------- tiers ----------
-- Tier for a number of points ever earned.
create or replace function public.tier_for(points integer) returns text
language sql stable set search_path = public as $$
  select tier from public.member_tiers where min_points <= points order by min_points desc limit 1;
$$;

-- The signed-in member's balance, points ever earned, tier and the next tier.
create or replace function public.my_status()
returns table (balance integer, lifetime integer, tier text, next_tier text, next_at integer)
language sql stable security definer set search_path = public as $$
  with s as (
    select coalesce(sum(points), 0)::int as balance,
           coalesce(sum(points) filter (where points > 0), 0)::int as lifetime
    from public.points_ledger where user_id = auth.uid()
  )
  select s.balance, s.lifetime, public.tier_for(s.lifetime),
         (select t.tier from public.member_tiers t where t.min_points > s.lifetime order by t.min_points limit 1),
         (select t.min_points from public.member_tiers t where t.min_points > s.lifetime order by t.min_points limit 1)
  from s;
$$;
revoke execute on function public.my_status() from public, anon;
grant execute on function public.my_status() to authenticated;

create or replace function public.my_tier_rank() returns smallint
language sql stable security definer set search_path = public as $$
  select t.rank from public.member_tiers t
  where t.tier = public.tier_for((select coalesce(sum(points) filter (where points > 0), 0)::int
                                  from public.points_ledger where user_id = auth.uid()));
$$;
revoke execute on function public.my_tier_rank() from public, anon;
grant execute on function public.my_tier_rank() to authenticated;

-- Guests may see how many member offers are live (not what they are).
create or replace function public.live_offer_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.member_offers
  where active and starts_at <= now() and (ends_at is null or ends_at > now());
$$;
-- Intentionally public: guests see only a number (Supabase advisor flags it; that's expected).
grant execute on function public.live_offer_count() to anon, authenticated;

-- ---------- access rules ----------
alter table public.profiles enable row level security;
alter table public.points_ledger enable row level security;
alter table public.member_offers enable row level security;
alter table public.member_tiers enable row level security;

drop policy if exists "anyone reads tiers" on public.member_tiers;
create policy "anyone reads tiers" on public.member_tiers for select to anon, authenticated using (true);
revoke insert, update, delete on public.member_tiers from anon, authenticated;

drop policy if exists "members read own profile" on public.profiles;
create policy "members read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "members update own profile" on public.profiles;
create policy "members update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, language, marketing_opt_in, nationality, phone, sms_opt_in, emergency_name, emergency_relation, emergency_phone)
  on public.profiles to authenticated;

drop policy if exists "members read own points" on public.points_ledger;
create policy "members read own points" on public.points_ledger
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.points_ledger from anon, authenticated;

drop policy if exists "members read live offers" on public.member_offers;
create policy "members read live offers" on public.member_offers
  for select to authenticated using (
    active and starts_at <= now() and (ends_at is null or ends_at > now())
    and (select t.rank from public.member_tiers t where t.tier = min_tier) <= public.my_tier_rank()
  );
revoke insert, update, delete on public.member_offers from anon, authenticated;

-- My trip: each member reads and changes only their own bookings. Guests can't touch the table.
alter table public.trip_bookings enable row level security;
drop policy if exists "members read own bookings" on public.trip_bookings;
create policy "members read own bookings" on public.trip_bookings
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "members add own bookings" on public.trip_bookings;
create policy "members add own bookings" on public.trip_bookings
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "members change own bookings" on public.trip_bookings;
create policy "members change own bookings" on public.trip_bookings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "members delete own bookings" on public.trip_bookings;
create policy "members delete own bookings" on public.trip_bookings
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.trip_bookings from anon;
grant select, insert, update, delete on public.trip_bookings to authenticated;

-- Our Pick!: everyone reads live listings, guests too. Only staff (Table Editor) add or change them,
-- and the staff-only columns (consent, approval) can't be read by the app at all.
alter table public.our_picks enable row level security;
drop policy if exists "anyone reads live picks" on public.our_picks;
create policy "anyone reads live picks" on public.our_picks
  for select to anon, authenticated using (approved and active and consent_on is not null);
revoke all on public.our_picks from anon, authenticated;
grant select (slug, city, name, names, area, address, lat, lng, blurb, dishes, price_range, halal, halal_body, halal_expires,
  hours, hours_note, pay, phone, photos, photo_credit, sponsored, checked_on, sort, updated_at)
  on public.our_picks to anon, authenticated;

-- ---------- first news item (edit or delete it in Table Editor) ----------
insert into public.member_offers (kind, title, body)
select 'news',
  '{"en": "Welcome to Miiuz BB members", "zh": "欢迎加入 Miiuz BB 会员", "ko": "Miiuz BB 회원이 되신 걸 환영해요", "ja": "Miiuz BB メンバーへようこそ"}',
  '{"en": "Member offers, goodies and travel news will appear here.", "zh": "会员优惠、小礼物和旅行资讯都会出现在这里。", "ko": "회원 혜택, 선물, 여행 소식이 여기에 올라와요.", "ja": "メンバー限定の特典・プレゼント・旅のお知らせはここに届きます。"}'
where not exists (select 1 from public.member_offers);
