/* Miiuz Beyond Borders — GET /api/config: public settings the browser needs.
 * The Supabase URL and anon/publishable key are meant to be public; member data is
 * protected by the access rules in supabase/schema.sql. Accepts the variable names the
 * Vercel ↔ Supabase integration creates as well as plain ones.
 * `country` is the visitor's country from Vercel's x-vercel-ip-country header (two letters,
 * empty when unknown or running locally). The app uses it only as a home-country hint
 * (js/country.js); it isn't logged or stored.
 * `version` and `build` say which version is live: package.json's version and the deployment's
 * commit ("dev" locally). The app registers its service worker with the build and shows the update
 * banner when it changes; `minVersion` (MIIUZ_MIN_VERSION) forces older copies to update (#30). */
import { APP_VERSION, minVersion, sendJson } from "./_shared.mjs";

export default function handler(req, res) {
  const env = process.env;
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const ip = String(req.headers?.["x-vercel-ip-country"] || "").toUpperCase();
  const country = /^[A-Z]{2}$/.test(ip) ? ip : "";
  const build = String(env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || String(env.VERCEL_DEPLOYMENT_ID || "").replace(/[^\w-]/g, "") || "dev";
  // Not cached, so new settings and new builds are seen straight away.
  sendJson(res, 200, { supabaseUrl, supabaseKey, country, version: APP_VERSION, build, minVersion: minVersion() });
}
