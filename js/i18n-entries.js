/* Miiuz Beyond Borders — every translatable string, with a stable key, its English source
 * and a setter that stores a translation in place. Used by the in-app AI translator
 * (js/translate.js) and by `npm run translate` (scripts/translate.mjs).
 * Order matters: interface first, then what the home screen shows, then the rest. */
(function (root) {
  // Short content hash so a cached translation is dropped when its English source changes.
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  const placeholders = s => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
  // A translation is usable when it is non-empty text with exactly the source's placeholders.
  const valid = (src, out) => typeof out === "string" && out.trim() !== "" && placeholders(src) === placeholders(out);

  function collect(STR, C) {
    const out = [];
    const add = (key, src, set) => { if (typeof src === "string" && src.trim()) out.push({ key, src, set }); };
    const into = obj => (lang, v) => { obj[lang] = v; };

    for (const [k, v] of Object.entries(STR)) {
      if (Array.isArray(v.en)) v.en.forEach((s, i) => add(`ui.${k}.${i}`, s, (lang, val) => { (v[lang] ??= [...v.en])[i] = val; }));
      else add(`ui.${k}`, v.en, into(v));
    }

    add("country.name", C.name.en, into(C.name));
    add("currency.name", C.currency.name.en, into(C.currency.name));
    for (const [id, c] of Object.entries(C.cities)) {
      add(`city.${id}.name`, c.en, into(c));
      add(`city.${id}.airport`, c.airport.en, into(c.airport));
      add(`city.${id}.transfer`, c.transferNote.en, into(c.transferNote));
    }
    C.climate.forEach((m, i) => add(`climate.${i}`, m.en, into(m)));
    C.emergency.filter(e => !e.only).forEach(e => { add(`sos.${e.id}.label`, e.label.en, into(e.label)); add(`sos.${e.id}.note`, e.note.en, into(e.note)); });
    C.guide.forEach(g => { add(`guide.${g.id}.title`, g.title.en, into(g.title)); add(`guide.${g.id}.lead`, g.lead.en, into(g.lead)); });
    C.checklist.forEach(g => { add(`check.${g.id}.title`, g.title.en, into(g.title)); g.items.forEach(it => add(`check.${g.id}.${it.id}`, it.en, into(it))); });
    add("driver", C.driverCard.en, into(C.driverCard));
    C.phrases.forEach(c => { add(`phr.${c.id}.title`, c.title.en, into(c.title)); c.items.forEach((p, i) => add(`phr.${c.id}.${i}`, p.en, into(p))); });

    C.guide.forEach(g => {
      (g.facts || []).forEach((f, i) => { add(`guide.${g.id}.f${i}.k`, f.k.en, into(f.k)); add(`guide.${g.id}.f${i}.v`, f.v.en, into(f.v)); });
      g.sections.forEach((s, i) => { add(`guide.${g.id}.s${i}.h`, s.h.en, into(s.h)); s.items.forEach((it, j) => add(`guide.${g.id}.s${i}.${j}`, it.en, into(it))); });
      (g.links || []).forEach((l, i) => { if (!l.only) add(`guide.${g.id}.l${i}`, l.label.en, into(l.label)); });
      (g.dishes || []).forEach((d, i) => add(`guide.${g.id}.d${i}`, d.en, into(d)));
    });

    C.pois.forEach(p => {
      add(`poi.${p.id}.name`, p.en, into(p));
      add(`poi.${p.id}.why`, p.why.en, into(p.why));
      add(`poi.${p.id}.tip`, p.tip.en, into(p.tip));
    });
    return out;
  }

  // Group entries into requests of a manageable size, keeping their order.
  function chunk(entries, maxItems = 60, maxChars = 4500) {
    const chunks = [];
    let cur = [], size = 0;
    for (const e of entries) {
      if (cur.length && (cur.length >= maxItems || size + e.src.length > maxChars)) { chunks.push(cur); cur = []; size = 0; }
      cur.push(e); size += e.src.length;
    }
    if (cur.length) chunks.push(cur);
    return chunks;
  }

  const api = { collect, chunk, hash, valid };
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.MBB = root.MBB || {}; root.MBB.i18nEntries = api; }
})(typeof window !== "undefined" ? window : globalThis);
