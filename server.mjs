/* Local server: serves the app and /api/chat, like Vercel does in production.
 *   npm run dev                      (assistant off unless ANTHROPIC_API_KEY is set)
 *   npm run dev:env                  (reads ANTHROPIC_API_KEY etc. from .env)  */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chat from "./api/chat.mjs";
import translate from "./api/translate.mjs";
import config from "./api/config.mjs";
import places from "./api/places.mjs";
import media from "./api/media.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC = ["index.html", "manifest.webmanifest", "sw.js", "css/", "js/", "icons/", "locales/"];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/api/chat") return chat(req, res);
  if (url.pathname === "/api/translate") return translate(req, res);
  if (url.pathname === "/api/config") return config(req, res);
  if (url.pathname === "/api/places") return places(req, res);
  if (url.pathname === "/api/media") return media(req, res);

  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !PUBLIC.some(p => rel === p || (p.endsWith("/") && rel.startsWith(p)))) {
    res.writeHead(404).end("Not found");
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => {
  console.log(`Miiuz BB running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) console.log("Assistant is off: set ANTHROPIC_API_KEY (see README).");
});
