/* Pre-translate languages so they ship with the app (no AI wait or cost per phone).
 * Usage: ANTHROPIC_API_KEY=... node scripts/translate.mjs ms zh-Hant th   (codes from js/locales.js)
 *        add --all to (re)translate every AI language. Existing good entries are kept. */
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translateStrings } from "../api/_translate-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require(path.join(root, "js/i18n.js"));
const C = require(path.join(root, "js/data/malaysia.js"));
const { LANGS } = require(path.join(root, "js/locales.js"));
const E = require(path.join(root, "js/i18n-entries.js"));

const args = process.argv.slice(2);
const codes = args.includes("--all") ? Object.keys(LANGS).filter(k => !LANGS[k].full) : args;
if (!codes.length) { console.error("Name at least one language code, e.g. ms zh-Hant th (or --all)."); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) { console.error("Set ANTHROPIC_API_KEY first."); process.exit(1); }

mkdirSync(path.join(root, "locales"), { recursive: true });
for (const code of codes) {
  const lang = LANGS[code];
  if (!lang) { console.error(`Unknown language "${code}". See js/locales.js.`); continue; }
  if (lang.full) { console.log(`${code}: hand-translated already, skipping.`); continue; }
  const file = path.join(root, "locales", `${code}.json`);
  const out = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const todo = E.collect(globalThis.MBB.STR, C).filter(e => !(out[e.key] && out[e.key][0] === E.hash(e.src)));
  const chunks = E.chunk(todo);
  console.log(`${code} (${lang.native}): ${todo.length} strings in ${chunks.length} batches`);
  for (const [i, ch] of chunks.entries()) {
    try {
      const res = await translateStrings(lang, ch.map(e => e.src));
      ch.forEach((e, j) => { if (E.valid(e.src, res[j])) out[e.key] = [E.hash(e.src), res[j]]; });
      writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
      console.log(`  batch ${i + 1}/${chunks.length} done`);
    } catch (err) {
      console.error(`  batch ${i + 1} failed: ${err.message}`);
    }
  }
}
