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
require(path.join(root, "js/data/malaysia.explore.js"));
const MAP = require(path.join(root, "js/data/malaysia.map.js"));
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

// Explore data: every destination, souvenir, state and city summary in all four hand languages.
const four = (v, where) => { for (const l of ["zh", "en", "ko", "ja"]) if (!v?.[l]) fail(`${where} missing ${l}`); };
const dids = new Set();
for (const d of C.destinations) {
  if (dids.has(d.id)) fail(`duplicate destination ${d.id}`);
  dids.add(d.id);
  for (const k of ["name", "sum", "go", "when"]) four(d[k], `destination ${d.id}.${k}`);
  if (!C.states[d.state]) fail(`destination ${d.id}: unknown state ${d.state}`);
  if (!(d.lat > 0.8 && d.lat < 7.5 && d.lng > 99.5 && d.lng < 119.5)) fail(`destination ${d.id}: coordinates outside Malaysia`);
  if (!d.wp?.length) fail(`destination ${d.id}: no photo article`);
}
for (const s of C.souvenirs) { four(s.name, `souvenir ${s.id}.name`); four(s.desc, `souvenir ${s.id}.desc`); if (!s.wp?.length) fail(`souvenir ${s.id}: no photo article`); }
for (const [id, st] of Object.entries(C.states)) four(st, `state ${id}`);
for (const [id, c] of Object.entries(C.cities)) { four(c.sum, `city ${id}.sum`); if (!C.states[c.state] || !c.lat || !c.wp?.length) fail(`city ${id}: state, position or photo missing`); }
for (const p of C.pois) if (!C.photos.poi[p.id]?.length) fail(`place ${p.id}: no photo article`);
const dishes = C.guide.find(g => g.id === "food").dishes;
if (C.photos.dishes.length !== dishes.length || C.dishNames.length !== dishes.length) fail("photos.dishes / dishNames must match the Food guide's dishes");
if (!MAP.land || !MAP.near || !(MAP.k > 0)) fail("map data missing (run scripts/build-map.mjs)");

// Every literal t("key") in the app must exist (dynamic keys like t(`ptype.${k}`) are checked by prefix).
const { readFileSync } = await import("node:fs");
for (const f of readdirSync(path.join(root, "js")).filter(f => f.endsWith(".js"))) {
  const src = readFileSync(path.join(root, "js", f), "utf8");
  for (const [, key] of src.matchAll(/\bt\(\s*"([a-zA-Z][\w.]*)"/g)) if (!STR[key]) fail(`${f}: unknown string "${key}"`);
  for (const [, pre] of src.matchAll(/\bt\(\s*`([a-zA-Z][\w.]*\.)\$\{/g)) if (!Object.keys(STR).some(k => k.startsWith(pre))) fail(`${f}: no strings start with "${pre}"`);
}

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
