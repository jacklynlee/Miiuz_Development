/* Miiuz Beyond Borders — GET /api/photo?p=<path>: a Wikimedia Commons photo, served from our own
 * domain (#39). Wikipedia and Wikimedia are blocked in mainland China, so travellers there and on
 * Chinese roaming SIMs saw coloured tiles instead of photos. The app (js/media.js) turns
 * https://thumb.wikimedia.org/wikipedia/commons/<path> (thumbnails) and
 * https://upload.wikimedia.org/wikipedia/commons/<path> (original files) into /api/photo?p=<path>;
 * the photo's author and licence are still shown with it.
 *  - Only Commons files: <path> must look like "a/ab/File.jpg" or "thumb/a/ab/File.jpg/500px-File.jpg",
 *    so this can't be used to fetch anything else.
 *  - Only JPEG, PNG, WebP and GIF (never SVG, which could run scripts on our domain).
 *  - Fetched with our User-Agent (Wikimedia's policy), and cached by Vercel's CDN for a year and by
 *    phones for 30 days, so each photo is fetched from Wikimedia rarely. The service worker also
 *    keeps the photos a traveller has seen, for offline use (sw.js).
 *  - Files too big for a function response go straight to Wikimedia instead (rare: thumbnails are small).
 * GET /api/photo?pick=<file>: an Our Pick! photo (#50), the owner's own photo used with their written
 * permission, from our Supabase project's public Storage bucket "our-picks". Only plain file names
 * ("nasi-lemak-wanjo-1.webp"), cached the same way. */
import { sendJson, rateLimiter } from "./_http.mjs";
import { UA } from "./_wiki.mjs";
import { PHOTO_FILE } from "./picks.mjs";

// Commons serves thumbnails from thumb.wikimedia.org and original files from upload.wikimedia.org.
const upstream = p => `https://${p.startsWith("thumb/") ? "thumb" : "upload"}.wikimedia.org/wikipedia/commons/${p}`;
// "a/ab/File.jpg", "thumb/a/ab/File.jpg/500px-File.jpg", "thumb/a/ab/File.tif/lossy-page1-500px-File.tif.jpg"
const PATH = /^(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/[^/?#\\]+(?:\/(?:[a-z]+-page\d+-)?\d{1,4}px-[^/?#\\]+)?$/;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 4_000_000; // Vercel's response limit is 4.5 MB
const CACHE = "public, max-age=2592000, s-maxage=31536000, stale-while-revalidate=31536000";
// Only cache misses reach the function, so this only stops someone pulling many files through us.
const limited = rateLimiter(Number(process.env.MIIUZ_PHOTO_LIMIT || 600));

export const photoPath = p => (typeof p === "string" && PATH.test(p) && !p.split("/").includes("..") ? p : null);
// An Our Pick! photo in our own Supabase Storage, or null.
function pickUrl(file) {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (typeof file !== "string" || !PHOTO_FILE.test(file) || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(base)) return null;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/our-picks/${file}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return sendJson(res, 405, { error: "GET only" }); }
  const q = new URL(req.url, "http://x").searchParams;
  const p = photoPath(q.get("p"));
  const url = p ? upstream(p) : q.has("pick") ? pickUrl(q.get("pick")) : null;
  if (!url) return sendJson(res, 400, { error: "not a Commons file or an Our Pick! photo" }, "public, max-age=3600, s-maxage=86400");
  if (limited(req)) return sendJson(res, 429, { error: "rate_limited" });

  // Too big for a function response: let the phone fetch it from Wikimedia (or Supabase) itself.
  const away = () => {
    res.statusCode = 302;
    res.setHeader("Location", url);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.end();
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" }, signal: ctl.signal });
    if (r.status === 404 || r.status === 400) return sendJson(res, 404, { error: "not_found" }, "public, max-age=3600, s-maxage=86400");
    if (!r.ok) return sendJson(res, 502, { error: "upstream" }, "public, max-age=60, s-maxage=60");
    const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!TYPES.has(type)) return sendJson(res, 415, { error: "not a photo" }, "public, max-age=3600, s-maxage=86400");
    if (Number(r.headers.get("content-length") || 0) > MAX_BYTES) { r.body?.cancel().catch(() => {}); return away(); }
    const body = Buffer.from(await r.arrayBuffer());
    if (body.length > MAX_BYTES) return away();
    res.statusCode = 200;
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Length", String(body.length));
    res.setHeader("Cache-Control", CACHE);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (e) {
    console.error("photo", e?.name === "AbortError" ? "timeout" : e?.message);
    sendJson(res, 502, { error: "upstream" }, "public, max-age=60, s-maxage=60");
  } finally {
    clearTimeout(timer);
  }
}
