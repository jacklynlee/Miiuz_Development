/* Miiuz Beyond Borders — POST /api/translate: translate a batch of the app's English strings
 * into one of the languages in js/locales.js. Body: { lang: "fr", items: ["…", …] }. */
import { LANGS, configured, originAllowed, rateLimiter, readJson, sendJson, errorCode, tooOld } from "./_shared.mjs";
import { translateStrings } from "./_translate-core.mjs";

const limited = rateLimiter(Number(process.env.MIIUZ_TRANSLATE_LIMIT || 80));

export default async function handler(req, res) {
  if (tooOld(req)) return sendJson(res, 426, { code: "update" }); // the app shows "Please update" (#30)
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { code: "method_not_allowed" }); }
  if (!configured()) return sendJson(res, 503, { code: "not_configured" });
  if (!originAllowed(req)) return sendJson(res, 403, { code: "forbidden" });
  if (limited(req)) return sendJson(res, 429, { code: "rate_limited" });

  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { code: "bad_request" }); }
  const lang = LANGS[body?.lang];
  const items = body?.items;
  const ok = lang && !lang.full && Array.isArray(items) && items.length > 0 && items.length <= 80 &&
    items.every(s => typeof s === "string" && s.length <= 1500) && items.join("").length <= 12000;
  if (!ok) return sendJson(res, 400, { code: "bad_request" });

  try {
    sendJson(res, 200, { items: await translateStrings(lang, items) });
  } catch (err) {
    console.error("[miiuz] translate error:", err?.status || "", err?.message || err);
    sendJson(res, 502, { code: err?.code === "upstream" ? "upstream" : errorCode(err) });
  }
}
