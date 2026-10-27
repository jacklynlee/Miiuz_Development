/* Helpers shared by the API functions. Files starting with "_" are not routes on Vercel. */
import Anthropic from "@anthropic-ai/sdk";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const COUNTRY = require("../js/data/malaysia.js");
export const { LANGS } = require("../js/locales.js");
export const PROMPT = require("../js/prompt.js");

export const MODEL = process.env.MIIUZ_MODEL || "claude-opus-5-5";
export const MAX_BODY_BYTES = 1_500_000;

let client = null;
export const anthropic = () => (client ??= new Anthropic());
export const configured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

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

// Best-effort per-instance limiter: `max` requests per IP per 10 minutes.
export function rateLimiter(max) {
  const hits = new Map();
  return req => {
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter(ts => now - ts < 10 * 60 * 1000);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear();
    return recent.length > max;
  };
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

export { Anthropic };
