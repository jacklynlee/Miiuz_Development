/* Helpers shared by the API functions. Files starting with "_" are not routes on Vercel. */
import Anthropic from "@anthropic-ai/sdk";
import { createRequire } from "node:module";
import { sendJson, rateLimiter } from "./_http.mjs";

const require = createRequire(import.meta.url);
export const COUNTRY = require("../js/data/malaysia.js");
export const { LANGS } = require("../js/locales.js");
export const PROMPT = require("../js/prompt.js");

export const MODEL = process.env.MIIUZ_MODEL || "claude-opus-5-5";

/* ---------- app versions (#30) ----------
 * The app sends its version (package.json, MBB.VERSION in js/core.js) as X-Miiuz-Version.
 * Change request formats so the previous release keeps working. When that's impossible, or a
 * release fixes a wrong safety fact (SOS numbers, entry rules), set MIIUZ_MIN_VERSION (e.g. 1.0.2)
 * in Vercel: /api/config then tells older copies to update, and the APIs answer them 426. */
export const APP_VERSION = require("../package.json").version;
const SEMVER = /^\d+\.\d+\.\d+$/;
export const minVersion = () => (SEMVER.test(process.env.MIIUZ_MIN_VERSION || "") ? process.env.MIIUZ_MIN_VERSION : "");
export function olderThan(a, b) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}
// Copies from before #30 send no version, so they count as older than any minimum.
export function tooOld(req) {
  const min = minVersion(), v = String(req.headers?.["x-miiuz-version"] || "");
  return Boolean(min) && olderThan(SEMVER.test(v) ? v : "0.0.0", min);
}
export const MAX_BODY_BYTES = 1_500_000;

let client = null;
export const anthropic = () => (client ??= new Anthropic());
export const configured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body; // Vercel parses JSON bodies
  if (typeof req.body === "string") return JSON.parse(req.body);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("too large"), { code: "too_long" });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function originAllowed(req) {
  const allowed = (process.env.MIIUZ_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const origin = req.headers.origin;
  return !origin || allowed.includes(origin);
}

export function errorCode(err) {
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "not_configured";
  if (err instanceof Anthropic.BadRequestError) return "bad_request";
  return "upstream";
}

export { Anthropic, sendJson, rateLimiter };
