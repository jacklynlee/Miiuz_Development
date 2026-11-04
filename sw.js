/* Miiuz Beyond Borders — offline support. Bump VERSION whenever app files change. */
const VERSION = "mbb-v7";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/data/malaysia.js", "js/data/malaysia.explore.js", "js/data/malaysia.map.js", "js/data/malaysia.ko.js", "js/data/malaysia.ja.js",
  "js/i18n.js", "js/locales.js", "js/country.js", "js/core.js", "js/i18n-entries.js", "js/ai.js", "js/prompt.js", "js/translate.js",
  "js/guide.js", "js/planner.js", "js/tools.js", "js/chat.js", "js/install.js", "js/member.js", "js/media.js", "js/maps.js", "js/search.js", "js/place.js", "js/app.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== "mbb-fonts").map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache the assistant, member data or live exchange rates.
  if (url.pathname.startsWith("/api/") || url.hostname === "open.er-api.com" || url.hostname.endsWith(".supabase.co")) return;

  // Google Fonts: cache after first use so text looks right offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open("mbb-fonts").then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // App files: network first (fresh when online), cache when offline.
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? caches.match("index.html") : Response.error())),
  );
});
