/* Quick sanity checks: script syntax, data integrity, translations. Usage: npm run check */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let failed = 0;
const fail = msg => { failed++; console.error("✗", msg); };

const files = [
  ...readdirSync(path.join(root, "js/data")).map(f => "js/data/" + f),
  ...readdirSync(path.join(root, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f),
  ...readdirSync(path.join(root, "api")).map(f => "api/" + f),
  ...readdirSync(path.join(root, "scripts")).map(f => "scripts/" + f),
  "sw.js", "server.mjs",
];
for (const f of files) {
  try { execFileSync(process.execPath, ["--check", path.join(root, f)], { stdio: "pipe" }); }
  catch (e) { fail(`${f}: ${e.stderr}`); }
}

globalThis.window = globalThis;
const C = require(path.join(root, "js/data/malaysia.js"));
const { LANGS } = require(path.join(root, "js/locales.js"));
const { buildSystem, planTool } = require(path.join(root, "js/prompt.js"));
const E = require(path.join(root, "js/i18n-entries.js"));
require(path.join(root, "js/i18n.js"));
require(path.join(root, "js/data/malaysia.ko.js"));
require(path.join(root, "js/data/malaysia.ja.js"));
const STR = globalThis.MBB.STR;
const full = Object.keys(LANGS).filter(k => LANGS[k].full);

// Base pack: unique ids, zh + en everywhere.
const ids = new Set();
for (const p of C.pois) {
  if (ids.has(p.id)) fail(`duplicate place id ${p.id}`);
  ids.add(p.id);
  if (!C.cities[p.city]) fail(`${p.id}: unknown city ${p.city}`);
  for (const k of ["why", "tip"]) if (!p[k]?.zh || !p[k]?.en) fail(`${p.id}: missing ${k} translation`);
}
const bi = (v, where) => { if (!v || !v.zh || !v.en) fail(`missing zh/en at ${where}`); };
for (const g of C.guide) {
  bi(g.title, g.id + ".title"); bi(g.lead, g.id + ".lead");
  g.sections.forEach((s, i) => { bi(s.h, `${g.id}.sections[${i}]`); s.items.forEach((it, j) => bi(it, `${g.id}.sections[${i}].items[${j}]`)); });
}
if (C.climate.length !== 12) fail("climate needs 12 months");

// Interface strings: every hand-translated language present.
for (const [k, v] of Object.entries(STR)) for (const l of full) if (v[l] == null) fail(`i18n ${k} missing ${l}`);

// Overlays must line up with the base pack position by position.
for (const l of ["ko", "ja"]) {
  const o = globalThis.MBB.overlays[`my.${l}`];
  const w = where => `${l}: ${where}`;
  for (const p of C.pois) if (!o.pois[p.id] || o.pois[p.id].length !== 3) fail(w(`place ${p.id}`));
  for (const k of Object.keys(C.cities)) if (!o.cities[k]) fail(w(`city ${k}`));
  if (o.climate.length !== 12) fail(w("climate"));
  for (const e of C.emergency) if ((!e.only || e.only.includes(l)) && !o.emergency[e.id]) fail(w(`emergency ${e.id}`));
  for (const g of C.guide) {
    const v = o.guide[g.id];
    if (!v) { fail(w(`guide ${g.id}`)); continue; }
    if ((g.facts || []).length !== (v.facts || []).length) fail(w(`guide ${g.id} facts`));
    if (g.sections.length !== v.sections.length) fail(w(`guide ${g.id} sections`));
    g.sections.forEach((s, i) => { if (v.sections[i] && v.sections[i][1].length !== s.items.length) fail(w(`guide ${g.id} section ${i} items`)); });
    if ((g.links || []).length !== (v.links || []).length) fail(w(`guide ${g.id} links`));
    if ((g.dishes || []).length !== (v.dishes || []).length) fail(w(`guide ${g.id} dishes`));
  }
  for (const c of C.phrases) if (!o.phrases[c.id] || o.phrases[c.id].items.length !== c.items.length) fail(w(`phrases ${c.id}`));
  for (const g of C.checklist) for (const it of g.items) if (!o.checklist[g.id]?.items[it.id]) fail(w(`checklist ${it.id}`));
}

// AI-translation inventory and prompts.
const entries = E.collect(STR, C);
if (new Set(entries.map(e => e.key)).size !== entries.length) fail("duplicate translation keys");
const sys = buildSystem(C, "server");
if (sys !== buildSystem(C, "server")) fail("system prompt is not deterministic");
if (!planTool.input_schema) fail("plan tool schema missing");

console.log(failed
  ? `${failed} problem(s)`
  : `OK: ${files.length} scripts, ${C.pois.length} places, ${C.guide.length} guide topics, ${Object.keys(LANGS).length} languages (${full.join(", ")} hand-translated), ${entries.length} strings for AI translation, system prompt ${sys.length} chars`);
process.exit(failed ? 1 : 0);
