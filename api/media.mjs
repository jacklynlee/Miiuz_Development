/* Miiuz Beyond Borders — GET /api/media: photos for the app's own destinations, cities,
 * planner places, dishes and souvenirs, taken from the lead photo of their Wikipedia
 * article when it is freely licensed on Wikimedia Commons (with author and licence).
 * One response covers everything and is cached by Vercel's CDN for a week. */
import { createRequire } from "node:module";
import { sendJson } from "./_shared.mjs";
import { bestPhotos } from "./_wiki.mjs";

const require = createRequire(import.meta.url);
const C = require("../js/data/malaysia.explore.js");

export function mediaItems() {
  const items = [];
  for (const [id, c] of Object.entries(C.cities)) items.push({ key: `city:${id}`, titles: c.wp });
  for (const d of C.destinations) items.push({ key: `dest:${d.id}`, titles: d.wp });
  for (const p of C.pois) items.push({ key: `poi:${p.id}`, titles: C.photos.poi[p.id] || [p.en] });
  C.photos.dishes.forEach((titles, i) => items.push({ key: `dish:${i}`, titles }));
  for (const s of C.souvenirs) items.push({ key: `souv:${s.id}`, titles: s.wp });
  return items;
}

let memo = null; // per warm instance

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "GET only" });
  try {
    if (!memo || Date.now() - memo.at > 6 * 3600e3) memo = { at: Date.now(), items: await bestPhotos(mediaItems(), { avoid: C.photos.avoid }) };
    sendJson(res, 200, { v: 1, items: memo.items }, "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000");
  } catch (e) {
    console.error("media", e?.message);
    sendJson(res, 502, { error: "upstream" }, "public, max-age=60, s-maxage=300");
  }
}
