/* Miiuz Beyond Borders — search. Typing searches the app's own content instantly and offline
 * (cities, destinations, planner places, guide topics, dishes, souvenirs, phrases) in every
 * language the app has for it. Pressing Search also looks up any place in Malaysia on
 * OpenStreetMap through /api/places (never per keystroke, per OpenStreetMap's rules). */
(function () {
  const MBB = window.MBB;
  const { $, esc, t, L, icon } = MBB;
  const SS = window.sessionStorage;
  const S = { q: ss("s.q") || "", remote: { q: "", state: "idle", results: [] } };
  let index = null, indexLang = "", typing = null;

  function ss(k, v) {
    try { if (v === undefined) return SS?.getItem(k); SS?.setItem(k, v); } catch { /* private mode */ }
    return null;
  }
  // Lower-case, accents and Japanese voicing marks removed, punctuation → spaces.
  const norm = s => String(s ?? "").toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const CJK = /[぀-ヿ㐀-鿿가-힯]/;
  const texts = v => (v && typeof v === "object" ? Object.values(v).filter(x => typeof x === "string") : v ? [v] : []);

  /* ---------- the offline index ---------- */
  function build() {
    const C = MBB.C, lang = MBB.state.lang, out = [];
    const add = (it, keys, text) => {
      const k = [...new Set(keys.filter(Boolean).map(norm))].filter(Boolean);
      const x = norm(text.filter(Boolean).join(" "));
      out.push({ ...it, k, x, all: k.join(" ") + " " + x });
    };
    const stateKeys = id => (C.states[id] ? [...texts(C.states[id]), ...(C.states[id].aka || [])] : []);

    for (const [id, c] of Object.entries(C.cities)) {
      add({ kind: "city", href: `#place-city-${id}`, title: L(c), sub: [t("ptype.city"), L(C.states[c.state])].join(" · "), ic: "building", photo: `city:${id}`, boost: 8 },
        [L(c), c.en, c.zh, c.ko, c.ja, ...(c.aka || []), ...stateKeys(c.state)], [L(c.sum), c.sum?.en]);
    }
    for (const d of C.destinations) {
      add({ kind: "dest", href: `#place-dest-${d.id}`, title: L(d.name), sub: [t(`ptype.${d.kind}`), L(C.states[d.state])].join(" · "), ic: MBB.place.DEST_ICON[d.kind], photo: `dest:${d.id}`, boost: 6 },
        [...texts(d.name), ...(d.aka || []), ...stateKeys(d.state)], [L(d.sum), d.sum.en, L(d.go)]);
    }
    for (const p of C.pois) {
      add({ kind: "poi", href: `#place-poi-${p.id}`, title: MBB.placeName(p), sub: [t(`theme.${p.t[0]}`), L(C.cities[p.city])].join(" · "), ic: "pin", photo: `poi:${p.id}`, boost: 4 },
        [p.en, p.zh, p.ko, p.ja, p[lang]], [L(p.why), p.why.en, L(p.tip)]);
    }
    for (const g of C.guide) {
      add({ kind: "topic", href: `#guide-${g.id}`, title: L(g.title), sub: L(g.lead), ic: g.icon, boost: 3 },
        [L(g.title), g.title.en], [L(g.lead), g.lead.en, ...g.sections.flatMap(s => [L(s.h), ...s.items.filter(MBB.forMe).map(L)])]);
    }
    const food = C.guide.find(g => g.id === "food");
    (food?.dishes || []).forEach((d, i) => {
      add({ kind: "dish", href: "#guide-food", scroll: `dish-${i}`, title: d.ms, sub: L(d), ic: "bowl", photo: `dish:${i}`, boost: 2 },
        [d.ms, ...texts(C.dishNames[i]).flatMap(n => [n, ...n.split(" ")])], [L(d), d.en]);
    });
    for (const s of C.souvenirs) {
      add({ kind: "souv", href: "#guide-shopping", scroll: `souv-${s.id}`, title: L(s.name), sub: L(s.desc), ic: "gift", photo: `souv:${s.id}`, boost: 2 }, texts(s.name), [L(s.desc), s.desc.en]);
    }
    for (const c of C.phrases) c.items.forEach((p, i) => {
      add({ kind: "phrase", phrase: [c.id, i], title: p.ms, sub: L(p), ic: "speaker", boost: 0 }, [p.ms], [L(p), p.en]);
    });
    return out;
  }
  const getIndex = () => (index && indexLang === MBB.state.lang ? index : ((indexLang = MBB.state.lang), (index = build())));
  MBB.on("lang", () => { index = null; });

  function score(q, it) {
    let s = 0;
    for (const k of it.k) {
      if (k === q) return 100 + it.boost;
      if (k.startsWith(q)) s = Math.max(s, 80);
      else if (k.includes(" " + q)) s = Math.max(s, 65);
      else if (k.includes(q)) s = Math.max(s, 50);
    }
    if (!s && (q.length >= 3 || (CJK.test(q) && q.length >= 2)) && it.x.includes(q)) s = 20;
    if (!s && q.includes(" ")) {
      const words = q.split(" ").filter(w => w.length > 2 || CJK.test(w));
      if (words.length && words.every(w => it.all.includes(w))) s = 25;
      // Otherwise any word that starts a title word ("sim card" → "SIM & internet").
      else if (words.some(w => it.k.some(k => k.startsWith(w) || k.includes(" " + w)))) s = 15;
    }
    return s ? s + it.boost : 0;
  }
  function find(query) {
    const q = norm(query);
    if (!q) return [];
    return getIndex().map(it => ({ it, s: score(q, it) })).filter(x => x.s).sort((a, b) => b.s - a.s).map(x => x.it);
  }

  /* ---------- rendering ---------- */
  const row = it => {
    const attrs = it.phrase ? `href="#search" data-phrase="${it.phrase.join(":")}"` : `href="${it.href}"${it.scroll ? ` data-scroll="${it.scroll}"` : ""}`;
    const thumb = it.photo && MBB.media.get(it.photo) ? MBB.media.html(it.photo, { alt: "", ic: it.ic, cls: "s-thumb" }) : `<span class="badge-ic">${icon(it.ic || "pin")}</span>`;
    return `<a class="s-row" ${attrs}>${thumb}<span><b>${esc(it.title)}</b><small>${esc(it.sub || "")}</small></span>${icon("next", "next")}</a>`;
  };
  const group = (title, list, max) => (list.length ? `<section class="s-group"><h2>${esc(title)}</h2><div class="s-list">${list.slice(0, max).map(row).join("")}</div></section>` : "");

  function remoteBlock(q) {
    const R = S.remote;
    const askBtn = !MBB.features.ask ? "" : `<button type="button" class="s-row s-ask" id="s-ask"><span class="badge-ic">${icon("spark")}</span><span><b>${esc(t("search.ask", { q }))}</b><small>${esc(t("search.askD"))}</small></span>${icon("next", "next")}</button>`;
    if (R.q !== q || R.state === "idle") {
      return `<button type="button" class="s-row s-more" id="s-remote"><span class="badge-ic hot">${icon("globe")}</span><span><b>${esc(t("search.all", { q }))}</b><small>${esc(t("search.allD"))}</small></span>${icon("next", "next")}</button>${askBtn}`;
    }
    if (R.state === "loading") return `<p class="hint s-wait">${esc(t("search.searching"))}</p>${askBtn}`;
    if (R.state === "off") return `<p class="hint">${esc(t("search.offline"))}</p>${askBtn}`;
    if (R.state === "error") return `<p class="hint">${esc(t("search.error"))}</p>${askBtn}`;
    const rows = R.results.map(p => {
      const cur = MBB.place.curatedFor(p);
      return `<a class="s-row" href="${cur || `#place-osm-${p.id}`}"><span class="badge-ic">${icon(MBB.place.typeIcon(p))}</span>
        <span><b>${esc(MBB.place.osmName(p))}</b><small>${esc(MBB.place.osmSub(p))}</small></span>${icon("next", "next")}</a>`;
    }).join("");
    return `<section class="s-group"><h2>${esc(t("search.allTitle"))}</h2>
      ${rows ? `<div class="s-list">${rows}</div>` : `<p class="hint">${esc(t("search.none"))}</p>`}
      <p class="hint osm-note">${esc(t("search.osm"))} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></p>
    </section>${askBtn}`;
  }

  function emptyState() {
    const C = MBB.C;
    const recent = MBB.store.get("recent", []);
    const tries = t("search.try");
    return `
      ${recent.length ? `<section class="s-group"><h2>${esc(t("search.recent"))}</h2><div class="s-list">${recent.map(r => row({ ...r, ic: r.ic || "pin" })).join("")}</div></section>` : ""}
      <section class="s-group"><h2>${esc(t("search.tryTitle"))}</h2>
        <div class="chips s-tries">${tries.map(x => `<button type="button" class="chip-btn" data-try="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      </section>
      <section class="s-group"><h2>${esc(t("explore.title"))}</h2>
        <div class="mymap-wrap">${MBB.maps.overview()}</div>
        <div class="dest-grid">${C.destinations.map(MBB.place.destCard).join("")}</div>
      </section>`;
  }

  function results() {
    const out = $("#s-out");
    if (!out) return;
    const q = S.q.trim();
    if (!q) { out.innerHTML = emptyState(); return; }
    const found = find(q);
    const by = k => found.filter(x => k.includes(x.kind));
    out.innerHTML = `
      ${group(t("search.places"), by(["city", "dest", "poi"]), 12)}
      ${remoteBlock(q)}
      ${group(t("search.guide"), by(["topic"]), 5)}
      ${group(t("search.food"), by(["dish", "souv"]), 6)}
      ${group(t("search.phrases"), by(["phrase"]), 4)}`;
  }

  async function remote(raw) {
    const q = raw.trim();
    if (!q) return;
    if (window.claude) { S.remote = { q, state: "off", results: [] }; results(); return; }
    S.remote = { q, state: "loading", results: [] };
    results();
    try {
      const r = await MBB.api(`api/places?q=${encodeURIComponent(q.toLowerCase().replace(/\s+/g, " "))}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      (j.results || []).forEach(MBB.place.remember);
      S.remote = { q, state: "done", results: j.results || [] };
    } catch {
      S.remote = { q, state: navigator.onLine === false ? "off" : "error", results: [] };
    }
    if (S.q.trim() === q) results();
  }

  function render() {
    const v = $("#view-search");
    v.innerHTML = `
      <a class="back" href="#home" data-back>${icon("back")}${esc(t("nav.home"))}</a>
      <div class="view-head">
        <p class="eyebrow" lang="ms">Cuti-cuti Malaysia!</p>
        <h1>${esc(t("search.title"))}</h1>
        <p>${esc(t("search.lead"))}</p>
      </div>
      <form class="search-form" id="s-form" role="search" autocomplete="off">
        <label class="sr-only" for="s-input">${esc(t("search.ph"))}</label>
        <span class="s-ic">${icon("search")}</span>
        <input type="search" id="s-input" enterkeyhint="search" maxlength="120" placeholder="${esc(t("search.ph"))}" value="${esc(S.q)}">
        <button type="submit" class="btn btn-main btn-sm">${esc(t("search.go"))}</button>
      </form>
      <div id="s-out" aria-live="polite"></div>`;

    const input = $("#s-input");
    input.addEventListener("input", () => {
      S.q = input.value; ss("s.q", S.q);
      clearTimeout(typing); typing = setTimeout(results, 60);
    });
    $("#s-form").addEventListener("submit", e => { e.preventDefault(); S.q = input.value; ss("s.q", S.q); input.blur(); remote(S.q); });
    $("#s-out").addEventListener("click", e => {
      const tr = e.target.closest("[data-try]");
      if (tr) { input.value = S.q = tr.dataset.try; ss("s.q", S.q); results(); return; }
      if (e.target.closest("#s-remote")) { remote(S.q); return; }
      if (e.target.closest("#s-ask")) { MBB.chat.askAbout(t("search.askPrompt", { q: S.q.trim() })); return; }
      const ph = e.target.closest("[data-phrase]");
      if (ph) {
        e.preventDefault();
        const [cid, i] = ph.dataset.phrase.split(":");
        const p = MBB.C.phrases.find(c => c.id === cid)?.items[Number(i)];
        if (p) MBB.present({ kicker: L(p), big: p.ms });
      }
    });
    results();
  }

  MBB.search = {
    render,
    focus() { const i = $("#s-input"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } },
    refresh() { if (location.hash === "#search") results(); },
    norm,
  };
  MBB.on("media", () => MBB.search.refresh());
})();
