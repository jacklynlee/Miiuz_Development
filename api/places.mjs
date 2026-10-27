/* Miiuz Beyond Borders — GET /api/places: find any place in Malaysia and describe it.
 *   ?q=batu caves            search OpenStreetMap (Nominatim), Malaysia only
 *   ?id=N123456&lang=ko      one OpenStreetMap place + its Wikipedia summary and photo
 *   ?wp=Batu Caves&lang=ko   Wikipedia summary for one of the app's own places
 * Nominatim's policy allows about one request a second and no search-as-you-type, so the
 * app only searches when the traveller presses Search, calls here are spaced out, and
 * answers are cached by Vercel's CDN. For heavier use, point MIIUZ_GEOCODER_URL at a
 * Nominatim-compatible service (e.g. LocationIQ) and set MIIUZ_GEOCODER_KEY. */
import { sendJson, rateLimiter, LANGS } from "./_shared.mjs";
import { getJson, summaryFor, summary, wikidata, wikiFor, commonsPhotos, pageImages } from "./_wiki.mjs";

const BASE = (process.env.MIIUZ_GEOCODER_URL || "https://nominatim.openstreetmap.org").replace(/\/+$/, "");
const KEY = process.env.MIIUZ_GEOCODER_KEY || "";
const CACHE = "public, max-age=3600, s-maxage=604800, stale-while-revalidate=2592000";
const limited = rateLimiter(Number(process.env.MIIUZ_PLACES_LIMIT || 80));

// One upstream geocoder call at a time, at least 1.1 s apart (per server instance).
let queue = Promise.resolve(), last = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function geocoder(path, params) {
  const url = `${BASE}/${path}?` + new URLSearchParams({ format: "jsonv2", addressdetails: "1", extratags: "1", namedetails: "1", "accept-language": "en", ...params, ...(KEY ? { key: KEY } : {}) });
  const run = async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    return getJson(url, { timeout: 9000 });
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

// Names worth sending: the local name plus the languages the app speaks.
const NAME_KEYS = new Set(["en", "ms", "zh-Hans", "zh-Hant", "zh-CN", "zh-TW", "zh-HK", "tl", "no", ...Object.keys(LANGS), ...Object.values(LANGS).map(l => l.tag)]);
const TAGS = ["opening_hours", "phone", "contact:phone", "website", "contact:website", "wikipedia", "wikidata", "cuisine", "fee", "charge", "religion", "wheelchair"];
// ISO 3166-2:MY codes → the app's state ids.
const STATE = { "MY-01": "johor", "MY-02": "kedah", "MY-03": "kelantan", "MY-04": "melaka", "MY-05": "negeri_sembilan", "MY-06": "pahang", "MY-07": "penang", "MY-08": "perak", "MY-09": "perlis", "MY-10": "selangor", "MY-11": "terengganu", "MY-12": "sabah", "MY-13": "sarawak", "MY-14": "kl", "MY-15": "labuan", "MY-16": "putrajaya" };

function trim(r) {
  const a = r.address || {};
  const names = {};
  for (const [k, v] of Object.entries(r.namedetails || {})) {
    if (k === "name") names._ = v;
    else if (k.startsWith("name:") && NAME_KEYS.has(k.slice(5))) names[k.slice(5)] = v;
  }
  const tags = {};
  for (const k of TAGS) if (r.extratags?.[k]) tags[k.replace("contact:", "")] ??= String(r.extratags[k]).slice(0, 300);
  const town = a.city || a.town || a.village || a.municipality || a.county || "";
  return {
    id: `${String(r.osm_type || "n")[0].toUpperCase()}${r.osm_id}`,
    name: r.name || names._ || String(r.display_name || "").split(",")[0],
    names, cat: r.category, type: r.type, kind: r.addresstype,
    lat: Number(r.lat), lng: Number(r.lon),
    town, state: STATE[a["ISO3166-2-lvl4"]] || "", stateName: a.state || "",
    addr: String(r.display_name || "").replace(/,\s*Malaysia$/, ""),
    tags,
  };
}

const okLang = l => (LANGS[l] ? l : "en");

async function detail(id, lang) {
  const [r] = await geocoder("lookup", { osm_ids: id });
  if (!r) return null;
  const place = trim(r);
  const want = wikiFor(lang);
  let wiki = null, photoFile = null;
  try {
    if (place.tags.wikidata && /^Q\d+$/.test(place.tags.wikidata)) {
      const d = await wikidata(place.tags.wikidata, [...new Set([want, "en"])]);
      photoFile = d?.image || null;
      const title = d?.titles[want] || d?.titles.en;
      if (title) wiki = await summary(d.titles[want] ? want : "en", title, lang).catch(() => null);
      if (!photoFile && title) photoFile = (await pageImages(d.titles[want] ? want : "en", [title]))[title];
    } else if (place.tags.wikipedia) {
      const [, w, title] = /^([a-z-]+):(.+)$/.exec(place.tags.wikipedia) || [];
      if (w && title) {
        wiki = await summaryFor(w, title, lang);
        photoFile = (await pageImages(w, [title]))[title];
      }
    }
  } catch (e) { console.error("places wiki", e?.message); }
  const photo = photoFile ? (await commonsPhotos([photoFile]).catch(() => ({})))[photoFile] || null : null;
  return { ...place, wiki, photo };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "GET only" });
  const u = new URL(req.url, "http://x");
  const q = (u.searchParams.get("q") || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const id = u.searchParams.get("id") || "";
  const wp = (u.searchParams.get("wp") || "").trim().slice(0, 200);
  const lang = okLang(u.searchParams.get("lang") || "en");
  if (limited(req)) return sendJson(res, 429, { error: "rate_limited" });
  try {
    if (q) {
      if (q.length < 2) return sendJson(res, 400, { error: "too_short" });
      const list = await geocoder("search", { q, countrycodes: "my", limit: "12" });
      const seen = new Set(), results = [];
      for (const r of Array.isArray(list) ? list : []) {
        const p = trim(r), key = `${p.name}|${p.type}|${p.town}`;
        if (!seen.has(key)) { seen.add(key); results.push(p); }
      }
      return sendJson(res, 200, { results }, CACHE);
    }
    if (/^[NWR]\d{1,12}$/.test(id)) {
      const place = await detail(id, lang);
      return place ? sendJson(res, 200, { place }, CACHE) : sendJson(res, 404, { error: "not_found" }, CACHE);
    }
    if (wp) return sendJson(res, 200, { wiki: await summaryFor("en", wp, lang) }, CACHE);
    return sendJson(res, 400, { error: "Pass q, id or wp" });
  } catch (e) {
    console.error("places", e?.message);
    return sendJson(res, 502, { error: "upstream" }, "public, max-age=30, s-maxage=60");
  }
}
