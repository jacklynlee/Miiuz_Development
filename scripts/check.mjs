/* Quick sanity checks: script syntax, data integrity, translations. Usage: npm run check */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  const own = { ko: "KR", ja: "JP" }[l]; // a hand-translated language must cover its own country's lines
  for (const e of C.emergency) if ((!e.for || e.for.includes(own)) && !o.emergency[e.id]) fail(w(`emergency ${e.id}`));
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

// Home country (js/country.js): codes, currencies and detection.
const O = require(path.join(root, "js/country.js"));
for (const x of [...C.emergency, ...C.guide.flatMap(g => [...(g.links || []), ...(g.facts || []), ...g.sections.flatMap(s => s.items)])]) {
  if (x.only) fail(`"only" (by language) was replaced by "for" (by home country): ${x.id || x.url}`);
  for (const c of x.for || []) if (!O.valid(c)) fail(`unknown country code "${c}" in for: ${x.id || x.url || x.en || x.k?.en}`);
  for (const c of Object.keys(x.like || {})) if (!O.valid(c)) fail(`unknown country code "${c}" in like: ${x.id}`);
}
for (const c of O.COMMON) if (!O.valid(c)) fail(`country.js COMMON: unknown code ${c}`);
for (const [c, cur] of Object.entries(O.CURRENCY)) if (!O.valid(c) || !/^[A-Z]{3}$/.test(cur)) fail(`country.js CURRENCY: ${c} → ${cur}`);
const guess = (o, want) => { const got = O.detect(o).code; if (got !== want) fail(`country.detect(${JSON.stringify(o)}) gave ${got}, expected ${want}`); };
guess({ languages: ["en-US"], timeZone: "America/New_York" }, "US");
guess({ languages: ["en-US"], timeZone: "Asia/Kuala_Lumpur" }, "US");
guess({ languages: ["zh-CN"], timeZone: "Asia/Kuala_Lumpur" }, "CN");
guess({ languages: ["zh-Hans-CN"], timeZone: "Asia/Shanghai" }, "CN");
guess({ languages: ["en-GB"], timeZone: "Asia/Kuala_Lumpur", ip: "CN" }, "CN"); // roaming SIM
guess({ languages: ["en-MY"], timeZone: "Asia/Kuala_Lumpur", ip: "MY", lang: "en" }, null); // Malaysia is never a guess
guess({ languages: ["zh-Hans"], timeZone: "Asia/Kuala_Lumpur", lang: "zh" }, "CN");
guess({ languages: ["en-US"], timeZone: "America/Chicago", member: "CN" }, "CN"); // nationality wins

// No CDNs or Google Fonts in what the browser loads: blocked or unreliable in mainland China (#18).
// Third-party files live in vendor/ and fonts/ (npm run vendor). The claude.ai preview is exempt.
const shipped = ["index.html", "sw.js", "css/app.css", "css/fonts.css", ...readdirSync(path.join(root, "js")).filter(f => f.endsWith(".js")).map(f => `js/${f}`)];
for (const f of shipped) {
  const src = readFileSync(path.join(root, f), "utf8");
  for (const host of ["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"]) if (src.includes(host)) fail(`${f} loads from ${host}; vendor it instead (npm run vendor)`);
}
for (const m of readFileSync(path.join(root, "sw.js"), "utf8").matchAll(/"((?:fonts|vendor|css)\/[^"]+)"/g)) if (!existsSync(path.join(root, m[1]))) fail(`sw.js caches ${m[1]}, which doesn't exist`);

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
