/* Miiuz Beyond Borders — GET /api/config: public settings the browser needs.
 * The Supabase URL and anon/publishable key are meant to be public; member data is
 * protected by the access rules in supabase/schema.sql. Accepts the variable names the
 * Vercel ↔ Supabase integration creates as well as plain ones. */
import { sendJson } from "./_shared.mjs";

export default function handler(req, res) {
  const env = process.env;
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  sendJson(res, 200, { supabaseUrl, supabaseKey }); // not cached, so new settings apply on the next visit
}
