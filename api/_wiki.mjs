/* Wikipedia, Wikimedia Commons and Wikidata helpers for api/media.mjs and api/places.mjs.
 * Only freely licensed Commons photos are used, always with author and licence, and never
 * logos, maps or photos flagged for personality rights or trademarks. */
const UA = "MiiuzBB/1.0 (+https://miiuz-bb.vercel.app)";

export async function getJson(url, { timeout = 8000, headers = {} } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: "application/json", ...headers }, signal: ctl.signal });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} from ${new URL(url).hostname}`), { status: r.status });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
const api = (host, params) => `https://${host}/w/api.php?` + new URLSearchParams({ format: "json", formatversion: "2", ...params });

// Follow MediaWiki's normalisation and redirects back to the titles we asked for.
function resolver(q) {
  const map = new Map();
  for (const n of q?.normalized || []) map.set(n.from, n.to);
  for (const r of q?.redirects || []) map.set(r.from, r.to);
  return t => { let x = t; for (let i = 0; i < 3 && map.has(x); i++) x = map.get(x); return x; };
}

// Lead photo file names for article titles on one Wikipedia: { title: "File name.jpg" | null }
export async function pageImages(wiki, titles) {
  const out = {};
  for (const part of chunks([...new Set(titles)], 50)) {
    const j = await getJson(api(`${wiki}.wikipedia.org`, { action: "query", redirects: "1", prop: "pageimages", piprop: "name", pilicense: "free", titles: part.join("|") }));
    const final = resolver(j.query);
    const byTitle = new Map((j.query?.pages || []).map(p => [p.title, p.pageimage || null]));
    for (const t of part) out[t] = byTitle.get(final(t)) ?? null;
  }
  return out;
}

const FREE = /^(cc[ -]?by(-sa)?([ -][\d.]+)?|cc0|public domain|pd\b)/i;
const NOT_A_PHOTO = /\b(map|locator|location|logo|flag|coat[ _]of[ _]arms|seal|montage|collage|diagram|emblem|icon)\b/i;
const strip = html => String(html || "")
  .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s+/g, " ").trim();

// Commons details for file names: { "File name.jpg": photo | null }
export async function commonsPhotos(files) {
  const out = {};
  const names = [...new Set(files.filter(Boolean))];
  for (const part of chunks(names, 40)) {
    const j = await getJson(api("commons.wikimedia.org", {
      action: "query", prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "960",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|Restrictions", titles: part.map(f => "File:" + f).join("|"),
    }));
    const final = resolver(j.query);
    const byTitle = new Map((j.query?.pages || []).map(p => [p.title, p]));
    for (const f of part) out[f] = photo(f, byTitle.get(final("File:" + f)));
  }
  return out;
}

function photo(file, page) {
  const ii = page?.imageinfo?.[0];
  if (!ii || page.missing) return null; // not on Commons (e.g. a local, non-free file)
  const m = ii.extmetadata || {};
  const lic = strip(m.LicenseShortName?.value);
  if (!FREE.test(lic) || /\bnc\b|\bnd\b/i.test(lic)) return null;
  if (/personality|trademark|insignia/i.test(m.Restrictions?.value || "")) return null;
  if (!/^image\/(jpeg|png|webp|tiff)$/.test(ii.mime) || NOT_A_PHOTO.test(file)) return null;
  const big = ii.thumburl || ii.url;
  return {
    src: /\/960px-/.test(big) ? big.replace("/960px-", "/500px-") : big,
    srcL: big,
    w: ii.thumbwidth || ii.width, h: ii.thumbheight || ii.height,
    file, page: ii.descriptionurl,
    by: strip(m.Artist?.value).slice(0, 100) || "Wikimedia Commons",
    lic, licUrl: m.LicenseUrl?.value || "",
  };
}

// The first candidate title whose lead photo is usable, for each item: { key: photo | null }.
// `avoid`: file names already reviewed and rejected.
export async function bestPhotos(items, { wiki = "en", avoid = [] } = {}) {
  const skip = new Set(avoid.map(f => f.replace(/ /g, "_")));
  const files = await pageImages(wiki, items.flatMap(x => x.titles));
  for (const t of Object.keys(files)) if (files[t] && skip.has(files[t].replace(/ /g, "_"))) files[t] = null;
  const photos = await commonsPhotos(Object.values(files));
  const out = {};
  for (const { key, titles } of items) out[key] = titles.map(t => photos[files[t]]).find(Boolean) || null;
  return out;
}

/* ---------- article summaries in the reader's language ---------- */
// App language → Wikipedia edition (and the script variant for Chinese).
const WIKI = { zh: "zh", "zh-Hant": "zh", yue: "zh-yue", fil: "tl", nb: "no" };
const VARIANT = { zh: "zh-hans", "zh-Hant": "zh-hant" };
export const wikiFor = lang => WIKI[lang] || lang;

export async function summary(wiki, title, lang) {
  const url = `https://${wiki}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const j = await getJson(url, { headers: VARIANT[lang] && wiki === "zh" ? { "Accept-Language": VARIANT[lang] } : {} });
  if (!j?.extract || j.type === "disambiguation") return null;
  return { title: j.title, text: j.extract, url: j.content_urls?.desktop?.page || "", wiki };
}

// The same article in another language edition, if there is one.
export async function langLink(fromWiki, title, toWiki) {
  if (fromWiki === toWiki) return title;
  const j = await getJson(api(`${fromWiki}.wikipedia.org`, { action: "query", redirects: "1", prop: "langlinks", lllang: toWiki, titles: title }));
  return j.query?.pages?.[0]?.langlinks?.[0]?.title || null;
}

// Best summary for the reader: their language if the article exists there, else the source edition.
export async function summaryFor(fromWiki, title, lang) {
  const want = wikiFor(lang);
  try {
    const t = await langLink(fromWiki, title, want);
    if (t) { const s = await summary(want, t, lang); if (s) return s; }
  } catch { /* fall back below */ }
  return summary(fromWiki, title, lang).catch(() => null);
}

// Wikidata: the article title per edition and the Commons image (P18) of an item.
export async function wikidata(qid, wikis) {
  const j = await getJson("https://www.wikidata.org/w/api.php?" + new URLSearchParams({
    action: "wbgetentities", format: "json", ids: qid, props: "sitelinks|claims", sitefilter: wikis.map(w => w.replace(/-/g, "_") + "wiki").join("|"),
  }));
  const e = j.entities?.[qid];
  if (!e) return null;
  const titles = {};
  for (const w of wikis) { const s = e.sitelinks?.[w.replace(/-/g, "_") + "wiki"]; if (s) titles[w] = s.title; }
  return { titles, image: e.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null };
}
