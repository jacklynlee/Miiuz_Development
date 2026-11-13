/* Miiuz Beyond Borders — offline support and updates (#30).
 * The page registers "sw.js?v=<build>", with the build from /api/config (the deployment's commit),
 * so every deployment installs a new worker with its own cache ("mbb-<build>"):
 *  - Installing stores all the app files below in one go, straight from the network. If any of them
 *    fails, the install fails and the previous version stays.
 *  - App files are served from that build's cache, so a page never mixes files from two versions.
 *    Files that aren't listed (other font subsets, vendor/, locales/) are added the first time.
 *  - A new build waits until the traveller taps Update (js/update.js) or the app closes, then
 *    takes over on reload. Old builds' caches are deleted.
 * Locally (v=dev), and for copies registered before #30 without ?v, app files are network first
 * (fresh when online, cache when offline), so edits show on reload. Nothing to bump by hand. */
const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const DEV = BUILD === "dev";
const VERSION = "mbb-" + BUILD;
// Wikimedia Commons photos the traveller has seen, for offline use (#32). Kept across builds, at most
// PHOTO_MAX (oldest out first). The app loads them with crossorigin, so they're stored at their real size.
// Since #39 they come through our own domain (/api/photo); Commons' own hosts are for older saved lists.
const PHOTOS = "mbb-photos", PHOTO_MAX = 200;
const PHOTO_HOSTS = ["thumb.wikimedia.org", "upload.wikimedia.org"];
const isPhoto = (url, req) => req.destination === "image" && (PHOTO_HOSTS.includes(url.hostname) || (url.origin === location.origin && url.pathname === "/api/photo"));
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/data/malaysia.js", "js/data/malaysia.explore.js", "js/data/malaysia.map.js", "js/data/malaysia.ko.js", "js/data/malaysia.ja.js",
  "js/i18n.js", "js/locales.js", "js/country.js", "js/core.js", "js/i18n-entries.js", "js/ai.js", "js/prompt.js", "js/translate.js",
  "js/guide.js", "js/planner.js", "js/tools.js", "js/chat.js", "js/install.js", "js/update.js", "js/member.js", "js/media.js", "js/picks.js", "js/maps.js", "js/search.js", "js/place.js", "js/explore.js", "js/trip.js", "js/book.js", "js/app.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  // Latin fonts, so text looks right offline from the first visit. Other subsets, MapLibre and the
  // Supabase client (vendor/) are cached the first time they're used.
  "css/fonts.css", "fonts/noto-sans-latin-400-normal.woff2", "fonts/noto-sans-latin-500-normal.woff2", "fonts/noto-sans-latin-700-normal.woff2",
  "fonts/noto-serif-latin-600-normal.woff2", "fonts/noto-serif-latin-900-normal.woff2", "fonts/ibm-plex-mono-latin-500-normal.woff2", "fonts/ibm-plex-mono-latin-600-normal.woff2",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map(u => new Request(u, { cache: "reload" })));
    // The first install, and local dev, take over straight away. A new build waits for Update.
    if (DEV || !self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== PHOTOS).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Photos the traveller has seen are kept for offline use, wherever they come from.
  if (isPhoto(url, req)) { e.respondWith(photo(req)); return; }

  // Never cache the assistant, member data, live exchange rates or Vercel Web Analytics.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_vercel/") || url.hostname === "open.er-api.com" || url.hostname.endsWith(".supabase.co")) return;

  if (url.origin !== location.origin) return;

  const page = req.mode === "navigate" && (url.pathname === "/" || url.pathname === "/index.html");
  const save = res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; };

  // Local dev and old registrations: network first, cache when offline.
  if (DEV) {
    e.respondWith(fetch(req).then(save).catch(async () => (await caches.match(req)) || (page ? caches.match("index.html") : Response.error())));
    return;
  }

  // A build: its own files first, then the network (stored for next time).
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(page ? "index.html" : req);
    if (hit) return hit;
    try { return save(await fetch(req)); }
    catch { return (await caches.match(req)) || Response.error(); }
  })());
});

// Photos: the stored copy first (a Commons thumbnail never changes), else the network.
async function photo(req) {
  const cache = await caches.open(PHOTOS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && (res.type === "cors" || res.type === "basic")) { // not opaque, so the real size is stored
    await cache.put(req, res.clone());
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - PHOTO_MAX)).map(k => cache.delete(k)));
  }
  return res;
}
