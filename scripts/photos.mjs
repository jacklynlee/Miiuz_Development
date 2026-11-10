/* Photo report for the app's own items (#32). Usage: npm run photos   (needs the network)
 * Run it before each release. It lists:
 *  - items with no photo, and items whose photo isn't a reviewed pin (photos.pin in
 *    js/data/malaysia.explore.js), for example a new place
 *  - pins that no longer work: the file was deleted, renamed or relicensed on Commons
 *  - Wikipedia titles that are missing, a disambiguation page, or don't mention Malaysia
 *    (the first title gives the place page its summary)
 * Exits with 1 when something needs fixing, so it can gate a release checklist. */
import { createRequire } from "node:module";
import { mediaItems } from "../api/media.mjs";
import { bestPhotos, commonsPhotos, summary } from "../api/_wiki.mjs";

const require = createRequire(import.meta.url);
const C = require("../js/data/malaysia.explore.js");
const items = mediaItems();
const pin = C.photos.pin || {};
const norm = f => String(f || "").replace(/ /g, "_");
const problems = [], notes = [];

// Photos, as /api/media chooses them.
const photos = await bestPhotos(items, { avoid: C.photos.avoid, pin });
const pinned = await commonsPhotos(Object.values(pin));
for (const { key } of items) {
  const p = photos[key];
  if (!p) problems.push(`${key}: no photo`);
  if (!pin[key]) notes.push(`${key}: not pinned${p ? ` (shows ${p.file}: review it, then pin it)` : ""}`);
  else if (!pinned[pin[key]]) problems.push(`${key}: pinned file isn't usable any more (deleted, renamed or not freely licensed): ${pin[key]}`);
}
for (const k of Object.keys(pin)) if (!items.some(x => x.key === k)) problems.push(`photos.pin has "${k}", which isn't an item`);

// Titles: the first one gives the place page its summary, so it must be a real article about the place.
const MALAYSIA = /malaysia|malay|kuala lumpur|penang|pinang|george town|malacca|melaka|sabah|sarawak|borneo|johor|perak|pahang|terengganu|kelantan|kedah|selangor|langkawi|putrajaya|nyonya|peranakan/i;
const titles = [...new Set(items.flatMap(x => x.titles))];
const seen = {};
for (let i = 0; i < titles.length; i += 6) {
  await Promise.all(titles.slice(i, i + 6).map(async t => {
    try { seen[t] = (await summary("en", t, "en")) || "disambiguation"; }
    catch (e) { seen[t] = e.status === 404 ? "missing" : `error ${e.message}`; }
  }));
}
for (const { key, titles: ts } of items) {
  ts.forEach((t, i) => {
    const s = seen[t];
    const where = `${key}: ${i === 0 ? "first title" : "title"} "${t}"`;
    if (s === "missing") (i === 0 ? problems : notes).push(`${where} has no English Wikipedia article`);
    else if (s === "disambiguation") (i === 0 ? problems : notes).push(`${where} is a disambiguation page`);
    else if (typeof s === "string") notes.push(`${where}: ${s}`);
    // Places only: dishes and souvenirs are shared across the region, so their summaries needn't name Malaysia.
    else if (i === 0 && /^(city|dest|poi):/.test(key) && !MALAYSIA.test(s.text)) notes.push(`${where}: the summary doesn't mention Malaysia; check it's the right article (${s.url})`);
  });
}

const withPhoto = Object.values(photos).filter(Boolean).length;
console.log(`${items.length} items, ${withPhoto} with a photo, ${Object.keys(pin).length} pinned, ${titles.length} titles checked`);
if (notes.length) console.log("\nTo look at:\n  " + notes.join("\n  "));
if (problems.length) console.log("\nTo fix:\n  " + problems.join("\n  "));
else console.log("\nNothing to fix.");
process.exitCode = problems.length ? 1 : 0;
