/* Miiuz Beyond Borders — GET /api/picks: the live Our Pick! listings (#50), food places the Miiuz
 * team visited and recommends, from Supabase (table our_picks, supabase/schema.sql).
 *  - Read with the public (publishable) key, so only approved, active listings with the owner's
 *    consent come back, and only the columns the app may show (never consent or approval details).
 *  - Served from our own domain and cached by Vercel's CDN for 5 minutes, so it works where
 *    supabase.co is slow or blocked (#39) and Supabase is asked rarely.
 *  - Every value is checked again here; anything unexpected is dropped, not passed on.
 *  - A halal certificate past its expiry date is never shown as halal ("ask").
 * The app keeps the last answer on the phone for offline use (js/picks.js). */
import { sendJson, rateLimiter } from "./_http.mjs";

export const COLUMNS = "slug,city,name,names,area,address,lat,lng,blurb,dishes,price_range,halal,halal_body,halal_expires,hours,hours_note,pay,phone,photos,photo_credit,sponsored,checked_on,updated_at";
const CACHE = "public, max-age=300, s-maxage=300, stale-while-revalidate=86400";
const PAY = ["cash", "duitnow", "card", "alipay", "wechat"];
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const PHOTO_FILE = /^[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$/;
// OpenStreetMap's short opening hours, as supabase/schema.sql checks them.
const D = "(Mo|Tu|We|Th|Fr|Sa|Su)", T = "([01][0-9]|2[0-4]):[0-5][0-9]";
const RULE = `${D}(-${D})?(,${D}(-${D})?)* (off|${T}-${T}(,${T}-${T})*)`;
export const HOURS = new RegExp(`^(24/7|${RULE}(; ?${RULE})*)$`);
const limited = rateLimiter(Number(process.env.MIIUZ_PICKS_LIMIT || 300));

const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
// {"en": "...", "zh": "..."} with text values only.
function texts(v, max) {
  const out = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v)) if (LANG.test(k) && str(x, max)) out[k] = str(x, max);
  }
  return out;
}
// Today in Malaysia, as YYYY-MM-DD.
const todayMY = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

export function clean(r, today = todayMY()) {
  if (!r || typeof r !== "object") return null;
  const slug = str(r.slug, 60), name = str(r.name, 120), address = str(r.address, 300);
  const lat = Number(r.lat), lng = Number(r.lng), blurb = texts(r.blurb, 600);
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !name || !address || !blurb.en) return null;
  if (!(lat >= 0.8 && lat <= 7.5 && lng >= 99.5 && lng <= 119.5)) return null;
  if (!["certified", "no_pork", "not_halal"].includes(r.halal)) return null;
  const expires = DATE.test(r.halal_expires || "") ? r.halal_expires : null;
  const body = str(r.halal_body, 40);
  // Certified only while the certificate is valid; otherwise travellers are told to ask.
  const halal = r.halal !== "certified" ? r.halal : body && expires && expires >= today ? "certified" : "ask";
  const dishes = (Array.isArray(r.dishes) ? r.dishes : []).slice(0, 5).map(d => {
    const t = texts(d, 120);
    if (!t.en) return null;
    const ms = str(d.ms, 120), price = str(d.price, 30);
    return { ...t, ...(ms ? { ms } : {}), ...(price && /^RM\d/.test(price) ? { price } : {}) };
  }).filter(Boolean);
  const photos = (Array.isArray(r.photos) ? r.photos : []).filter(f => typeof f === "string" && PHOTO_FILE.test(f)).slice(0, 8);
  const hours = typeof r.hours === "string" && HOURS.test(r.hours.trim()) ? r.hours.trim() : null;
  const price = str(r.price_range, 30);
  return {
    slug, city: /^[a-z]{2,20}$/.test(r.city || "") ? r.city : "kl", name, names: texts(r.names, 120),
    area: str(r.area, 60), address, lat, lng, blurb, dishes,
    price: price && /^RM\d/.test(price) ? price : null,
    halal, halalBody: halal === "certified" ? body : null, halalExpires: halal === "certified" ? expires : null,
    hours, hoursNote: texts(r.hours_note, 200),
    pay: (Array.isArray(r.pay) ? r.pay : []).filter(p => PAY.includes(p)),
    phone: str(r.phone, 24), photos, credit: str(r.photo_credit, 80) || name,
    sponsored: r.sponsored === true,
    checked: DATE.test(r.checked_on || "") ? r.checked_on : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return sendJson(res, 405, { error: "GET only" }); }
  if (limited(req)) return sendJson(res, 429, { error: "rate_limited" });
  const env = process.env;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  // Supabase not connected (e.g. local development): no picks, nothing broken.
  if (!/^https:\/\//.test(url) || !key) return sendJson(res, 200, { picks: [], off: true }, "public, max-age=60, s-maxage=60");

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/our_picks?select=${COLUMNS}&order=sort.asc,name.asc&limit=200`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: ctl.signal,
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      // The table isn't there yet (schema.sql not run): no picks.
      if (r.status === 404 || j.code === "PGRST205" || j.code === "42P01") return sendJson(res, 200, { picks: [] }, "public, max-age=60, s-maxage=60");
      console.error("picks", r.status, j.code || "");
      return sendJson(res, 502, { error: "upstream" }, "public, max-age=30, s-maxage=30");
    }
    const rows = await r.json();
    const today = todayMY();
    const picks = (Array.isArray(rows) ? rows : []).map(x => clean(x, today)).filter(Boolean);
    sendJson(res, 200, { picks }, CACHE);
  } catch (e) {
    console.error("picks", e?.name === "AbortError" ? "timeout" : e?.message);
    sendJson(res, 502, { error: "upstream" }, "public, max-age=30, s-maxage=30");
  } finally {
    clearTimeout(timer);
  }
}
