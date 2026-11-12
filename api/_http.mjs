/* Small HTTP helpers with no dependencies, for functions that don't need the AI client or the app's
 * data (api/photo.mjs). api/_shared.mjs re-exports them. */
export function sendJson(res, status, body, cache = "no-store") {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(JSON.stringify(body));
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
