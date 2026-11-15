/* Miiuz Beyond Borders — languages without a hand-made translation.
 * When one is chosen the app shows English straight away, then fills in translated text
 * as it arrives: first from a bundled file (locales/<code>.json, made with
 * `npm run translate`), then from Miiuz AI for anything still missing. Results are kept
 * on the device, so each language is translated once per phone. */
(function () {
  const MBB = window.MBB;
  const { $, esc, t } = MBB;
  const E = MBB.i18nEntries;
  const PARALLEL = 3;
  const jobs = {};
  let entries = null;

  const list = () => (entries ??= E.collect(MBB.STR, MBB.C));
  const cacheKey = lang => `tr.${MBB.state.country}.${lang}`;

  /* ---------- progress bar ---------- */
  function bar(html, kind = "") {
    const el = $("#trbar");
    if (!html) { el.hidden = true; return; }
    el.className = `trbar ${kind}`;
    el.innerHTML = `<div class="wrap trbar-in">${html}</div>`;
    el.hidden = false;
  }
  const native = lang => MBB.LANGS[lang].native;

  let refreshTimer = null;
  function refresh(lang) {
    if (MBB.state.lang !== lang) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { MBB.applyStatic(); MBB.emit("lang", lang); }, 250);
  }

  /* ---------- sources ---------- */
  async function fromBundle(lang) {
    try {
      const r = await fetch(`locales/${lang}.json`, { cache: "no-cache" });
      return r.ok ? await r.json() : {};
    } catch { return {}; }
  }

  async function viaAI(lang, strings) {
    const info = MBB.LANGS[lang];
    if (MBB.ai.mode === "server") {
      const r = await MBB.api("api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, items: strings }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw { code: j.code || "upstream", fatal: r.status === 503 || r.status === 403 };
      return j.items;
    }
    if (MBB.ai.mode === "artifact") {
      const prompt = `${MBB.prompt.translateSystem(info)}\n\nReply with only the JSON object, like {"t": ["…", "…"]}, with exactly ${strings.length} strings.\n\nStrings:\n${JSON.stringify(strings)}`;
      try {
        const res = await MBB.ai.sample.json(prompt, { cache: { gcTime: 86400000 } });
        return res?.t;
      } catch (e) {
        if (MBB.ai.FATAL.includes(e?.code)) MBB.ai.disable();
        throw { code: e?.code || "upstream", fatal: MBB.ai.FATAL.includes(e?.code) || e?.code === "rate_limited" };
      }
    }
    throw { code: "off", fatal: true };
  }

  /* ---------- main ---------- */
  async function run(lang) {
    const all = list();
    const cached = MBB.store.get(cacheKey(lang), {});
    const apply = (e, val) => { e.set(lang, val); cached[e.key] = [E.hash(e.src), val]; };

    let missing = all.filter(e => {
      const c = cached[e.key];
      if (c && c[0] === E.hash(e.src)) { e.set(lang, c[1]); return false; }
      return true;
    });
    if (missing.length) {
      const bundle = await fromBundle(lang);
      missing = missing.filter(e => {
        const b = bundle[e.key];
        if (b && b[0] === E.hash(e.src) && E.valid(e.src, b[1])) { apply(e, b[1]); return false; }
        return true;
      });
      MBB.store.set(cacheKey(lang), cached);
    }
    refresh(lang);
    if (!missing.length) { bar(""); return; }

    await MBB.ai.ready;
    if (MBB.ai.mode !== "server" && MBB.ai.mode !== "artifact") {
      if (MBB.state.lang === lang) bar(`<span>${esc(t("lang.needsAi", { l: native(lang) }))}</span>`, "warn");
      return;
    }

    const chunks = E.chunk(missing);
    const total = chunks.length;
    let done = 0, failed = 0, stop = false;
    const progress = () => {
      if (MBB.state.lang !== lang) return;
      bar(`<span class="spin" aria-hidden="true"></span><span>${esc(t("lang.translating", { l: native(lang), p: Math.round((done / total) * 100) }))}</span>`);
    };
    progress();

    const worker = async () => {
      while (chunks.length && !stop) {
        const ch = chunks.shift();
        try {
          const out = await viaAI(lang, ch.map(e => e.src));
          if (!Array.isArray(out) || out.length !== ch.length) throw { code: "bad_output" };
          ch.forEach((e, i) => { if (E.valid(e.src, out[i])) apply(e, out[i]); });
          MBB.store.set(cacheKey(lang), cached);
          refresh(lang);
        } catch (err) {
          failed++;
          if (err?.fatal) stop = true;
        }
        done++;
        progress();
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));

    if (MBB.state.lang !== lang) return;
    if (failed) {
      bar(`<span>${esc(t("lang.failed"))}</span><button type="button" class="btn btn-ghost btn-sm" id="tr-retry">${esc(t("lang.retry"))}</button>`, "warn");
      $("#tr-retry").addEventListener("click", () => MBB.translator.ensure(lang));
    } else {
      bar("");
    }
  }

  MBB.translator = {
    ensure(lang) {
      const info = MBB.LANGS[lang];
      if (!info || info.full) { bar(""); return Promise.resolve(); }
      return (jobs[lang] ??= run(lang).finally(() => { delete jobs[lang]; }));
    },
    // More text arrived after the language was set up (Our Pick! listings): translate it too.
    more() {
      entries = null;
      const lang = MBB.state.lang, info = MBB.LANGS[lang];
      if (!info || info.full) return;
      (jobs[lang] || Promise.resolve()).then(() => MBB.translator.ensure(lang));
    },
  };
})();
