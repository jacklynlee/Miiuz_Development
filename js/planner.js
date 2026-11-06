/* Miiuz Beyond Borders — day planner (ported from the original half-day artifact). */
(function () {
  const MBB = window.MBB;
  const { $, $$, esc, t, L, fmt, toMin } = MBB;
  const clock = m => MBB.clock(m);

  const THEMES = ["food", "culture", "photo", "shop", "nature", "night"];
  const PERSONAS = {
    slow: { w: { quiet: 2, food: 1 }, pace: 1.25, max: 4, buffer: 15 },
    sprint: { w: { photo: 2 }, pace: 0.8, max: 7, buffer: 5 },
    social: { w: { lively: 2, food: 1, local: 1 }, pace: 1, max: 6, buffer: 10 },
    arty: { w: { quiet: 2, culture: 1, lively: -1 }, pace: 1.1, max: 5, buffer: 10 },
    adventure: { w: { active: 2, local: 2, nature: 1 }, pace: 1, max: 6, buffer: 8 },
  };
  const GROUPS = ["solo", "couple", "friends", "family"];
  const BUDGETS = ["0", "1", "2"];

  const saved = MBB.store.get("plan.prefs", {});
  const prefs = {
    start: saved.start || "13:00", end: saved.end || "18:30", flight: saved.flight || "22:30", flightOn: !!saved.flightOn,
    persona: PERSONAS[saved.persona] ? saved.persona : "social",
    themes: new Set(Array.isArray(saved.themes) ? saved.themes.filter(x => THEMES.includes(x)) : ["food", "photo"]),
    group: GROUPS.includes(saved.group) ? saved.group : "couple",
    budget: BUDGETS.includes(saved.budget) ? saved.budget : "1",
    rain: !!saved.rain, nowalk: !!saved.nowalk,
  };
  const savePrefs = () => MBB.store.set("plan.prefs", { ...prefs, themes: [...prefs.themes] });

  let seed = 7, current = null, rulePlan = null;
  const win = { start: 780, end: 1110 }; // resolved window in minutes

  const city = () => MBB.C.cities[MBB.state.city];
  const pois = () => MBB.C.pois.filter(p => p.city === MBB.state.city);
  const shortName = p => MBB.placeName(p).split(" · ")[0].split(" (")[0].split("（")[0];

  /* ---------- form ---------- */
  function chip(name, type, value, label, sub, checked) {
    const id = `p-${name}-${value}`;
    return `<div class="chip"><input type="${type}" name="${name}" id="${id}" value="${value}"${checked ? " checked" : ""}><label for="${id}">${esc(label)}${sub ? `<i>${esc(sub)}</i>` : ""}</label></div>`;
  }
  function buildForm() {
    $("#p-city").innerHTML = Object.entries(MBB.C.cities).map(([k, c]) => chip("city", "radio", k, L(c), L(c) !== c.en ? c.en.split(",")[0] : "", k === MBB.state.city)).join("");
    $("#p-persona").innerHTML = Object.keys(PERSONAS).map(k => chip("persona", "radio", k, t(`persona.${k}`), t(`persona.${k}D`), k === prefs.persona)).join("");
    $("#p-themes").innerHTML = THEMES.map(k => chip("themes", "checkbox", k, t(`theme.${k}`), "", prefs.themes.has(k))).join("");
    $("#p-group").innerHTML = GROUPS.map(k => chip("group", "radio", k, t(`group.${k}`), "", k === prefs.group)).join("");
    $("#p-budget").innerHTML = BUDGETS.map(k => chip("budget", "radio", k, t(`budget.${k}`), "", k === prefs.budget)).join("");
    $("#p-start").value = prefs.start; $("#p-end").value = prefs.end; $("#p-flight").value = prefs.flight;
    $("#p-flight-on").checked = prefs.flightOn; $("#p-rain").checked = prefs.rain; $("#p-nowalk").checked = prefs.nowalk;
    updateFlightHint();
  }
  function readForm() {
    const f = $("#prefs");
    const pick = n => f.querySelector(`input[name=${n}]:checked`)?.value;
    const c = pick("city");
    if (c && c !== MBB.state.city) MBB.setCity(c);
    prefs.persona = pick("persona") || prefs.persona;
    prefs.themes = new Set($$("input[name=themes]:checked", f).map(i => i.value));
    prefs.group = pick("group") || prefs.group;
    prefs.budget = pick("budget") || prefs.budget;
    prefs.rain = $("#p-rain").checked; prefs.nowalk = $("#p-nowalk").checked;
    prefs.start = $("#p-start").value || "13:00";
    prefs.flightOn = $("#p-flight-on").checked;
    prefs.flight = $("#p-flight").value || "22:30";
    win.start = toMin(prefs.start);
    if (prefs.flightOn) {
      let fl = toMin(prefs.flight);
      if (fl <= win.start) fl += 1440;
      win.end = fl - 180 - city().transfer;
      prefs.end = fmt(win.end);
      $("#p-end").value = prefs.end;
    } else {
      prefs.end = $("#p-end").value || "18:30";
      win.end = toMin(prefs.end);
      if (win.end <= win.start) win.end += 1440;
    }
    savePrefs();
    updateFlightHint();
  }
  function updateFlightHint() {
    const c = city(), on = $("#p-flight-on").checked;
    $("#p-flight-row").hidden = !on;
    $("#p-end").disabled = on;
    $("#p-flight-hint").textContent = on
      ? t("plan.flightHint", { note: L(c.transferNote) })
      : t("plan.airportHint", { a: L(c.airport), note: L(c.transferNote) });
  }

  /* ---------- engine ---------- */
  function rng(s) { return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
  function km(a, b) {
    const R = 6371, r = x => x * Math.PI / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function leg(a, b) {
    if (!a) return null;
    const d = km(a, b);
    if (d < (prefs.nowalk ? 0.5 : 1.0)) return { mode: "walk", min: Math.max(3, Math.round(d * 14)), km: d };
    return { mode: "car", min: Math.round((8 + d * 2.6) / 5) * 5, km: d };
  }
  function plan() {
    const P = PERSONAS[prefs.persona];
    const pace = P.pace * (prefs.group === "family" ? 1.15 : 1);
    const rand = rng(seed);
    const day = MBB.localNow().day;
    const pool = pois().filter(p => (!p.days || p.days.includes(day)) && !(p.closed || []).includes(day));
    const stops = []; let tm = win.start, pos = null, foods = 0;
    while (stops.length < P.max) {
      let best = null;
      for (const p of pool) {
        if (stops.some(s => s.poi === p)) continue;
        const l = leg(pos, p);
        const travel = l ? l.min + P.buffer : 0;
        const arrive = Math.max(tm + travel, p.o * 60);
        const wait = arrive - (tm + travel);
        const dur = Math.round(p.d * pace / 5) * 5;
        if (wait > 30) continue;
        if (arrive + dur > p.c * 60 + 1) continue;
        if (arrive + dur > win.end) continue;
        const h = (arrive / 60) % 24;
        let s = 0;
        for (const th of prefs.themes) if (p.t.includes(th)) s += 3;
        for (const [k, w] of Object.entries(P.w)) if (p.t.includes(k) || p.v.includes(k)) s += w;
        if (prefs.group === "family") { if (p.v.includes("family")) s += 2; if (p.v.includes("active")) s -= 3; }
        if (prefs.group === "couple" && p.t.includes("night")) s += 1;
        if (prefs.rain && !p.in) s -= 6;
        if (prefs.budget === "0" && p.k >= 2) s -= 5;
        if (prefs.budget === "1" && p.k === 3) s -= 1.5;
        const meal = (h >= 11.5 && h <= 13.5) || (h >= 17.75 && h <= 20.5);
        if (p.t.includes("food")) { if (meal && foods === 0) s += 5; if (foods >= 2) s -= 4; if (foods === 1 && !meal) s -= 2; }
        if (p.best === "evening") s += h >= 17 ? 3 : (h < 15 ? -3 : 0);
        if (p.best === "morning") s += h < 11 ? 2 : (h >= 14 ? -2.5 : 0);
        s -= (l ? l.min : 0) * 0.09;
        s -= wait * 0.05;
        s += rand() * 2.2;
        if (!best || s > best.s) best = { p, s, l, arrive, dur };
      }
      if (!best) break;
      stops.push({ poi: best.p, start: best.arrive, end: best.arrive + best.dur, leg: best.l });
      if (best.p.t.includes("food")) foods++;
      tm = best.arrive + best.dur; pos = best.p;
    }
    return { stops, source: "rule" };
  }

  /* ---------- render ---------- */
  const SITES = [
    ["Klook", q => `https://www.klook.com/${{ zh: "zh-CN/", "zh-Hant": "zh-TW/", yue: "zh-HK/", ko: "ko/", ja: "ja/" }[MBB.state.lang] || ""}search/result/?query=${q}`],
    ["Trip.com", q => `https://my.trip.com/global-search/searchlist/search?keyword=${q}`],
    ["Tripadvisor", q => `https://www.tripadvisor.com.my/Search?q=${q}`],
  ];
  const stopNames = s => {
    const p = s.poi, en = MBB.state.lang === "en";
    if (p) { const main = MBB.placeName(p); return { main, sub: main !== p.en ? p.en : "", en: p.en }; }
    const main = en ? (s.en || s.name) : (s.name || s.en);
    return { main, sub: s.en && s.en !== main ? s.en : "", en: s.en || s.name };
  };

  function render(pl) {
    current = pl;
    const c = city();
    const themes = [...prefs.themes].map(k => t(`theme.${k}`)).join(" · ") || t("plan.anyTheme");
    const last = pl.stops[pl.stops.length - 1];
    const free = last ? win.end - last.end : win.end - win.start;
    const pills = [
      `<span class="pill">${esc(L(c))}</span>`,
      `<span class="pill mono">${clock(win.start)}–${clock(win.end)}</span>`,
      `<span class="pill">${esc(t(`persona.${prefs.persona}`))}</span>`,
      `<span class="pill">${esc(themes)}</span>`,
      prefs.rain ? `<span class="pill warn">${esc(t("plan.indoorPill"))}</span>` : "",
      pl.source === "ai" ? `<span class="pill teal">${esc(t("plan.aiPill"))}</span>` : "",
    ].join("");
    const names = pl.stops.map(s => (s.poi ? shortName(s.poi) : stopNames(s).main));
    const count = MBB.state.lang === "en" && pl.stops.length === 1 ? "1 stop" : t("plan.stops", { n: pl.stops.length });
    const title = pl.title || (pl.stops.length ? `${count} · ${names.slice(0, 3).join(" → ")}${names.length > 3 ? " …" : ""}` : t("plan.empty"));
    const intro = pl.intro || (pl.stops.length
      ? t("plan.intro", { p: t(`persona.${prefs.persona}`) }) + (prefs.flightOn ? " " + t("plan.introFlight") : "")
      : t("plan.emptyHint"));
    $("#p-summary").innerHTML = `<h2>${esc(title)}</h2><div class="meta">${pills}</div><p>${esc(intro)}</p>`;

    const li = [];
    pl.stops.forEach(s => {
      const p = s.poi, n = stopNames(s);
      if (s.leg) li.push(`<li class="leg"><div></div><div>${esc(t(s.leg.mode === "walk" ? "plan.walk" : "plan.car"))} ${esc(t("plan.legMin", { m: s.leg.min }))}${s.leg.km ? ` · ${esc(MBB.dist(s.leg.km))}` : ""}</div></li>`);
      else if (s.legText) li.push(`<li class="leg"><div></div><div>${esc(s.legText)}</div></li>`);
      const q = encodeURIComponent(`${n.en || n.main}, ${c.en}, Malaysia`);
      const tags = p ? p.t.map(k => `<span class="tag${k === "food" ? " food" : ""}">${esc(t(`theme.${k}`))}</span>`).join("") + `<span class="tag">${esc(t("plan.cost")[p.k])}</span>` : "";
      const why = s.why || (p ? L(p.why) : "");
      const tip = s.tip || (p ? L(p.tip) : "");
      li.push(`<li class="stop"><div class="time">${clock(s.start)}<span>${clock(s.end)}</span></div>
        <div class="card"><h3>${esc(n.main)}${n.sub ? `<small>${esc(n.sub)}</small>` : ""}</h3>
        ${tags ? `<div class="tags">${tags}</div>` : ""}
        ${why ? `<p class="why">${esc(why)}</p>` : ""}
        ${tip ? `<p class="tip">${esc(tip)}</p>` : ""}
        <div class="maps"><a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">${esc(t("plan.maps"))}</a>${MBB.state.from === "CN" ? `<a href="${esc(p?.lat ? MBB.maps.amap(p.lat, p.lng, n.main) : `https://uri.amap.com/search?keyword=${encodeURIComponent(n.en || n.main)}`)}" target="_blank" rel="noopener">${esc(t("plan.amap"))}</a>` : ""}</div>
        <div class="book"><span>${esc(t("plan.book"))}</span>${SITES.map(([label, url]) => `<a href="${url(encodeURIComponent(n.en || n.main))}" target="_blank" rel="noopener">${label}</a>`).join("")}</div>
        </div></li>`);
    });
    if (pl.stops.length) {
      const endMsg = prefs.flightOn
        ? t("plan.endFlight", { a: L(c.airport), m: c.transfer })
        : (free >= 40 ? t("plan.endFree", { m: Math.round(free) }) : t("plan.endDone"));
      li.push(`<li class="stop"><div class="time">${clock(win.end)}</div><div class="card endcard"><h3>${esc(t(prefs.flightOn ? "plan.toAirport" : "plan.wrap"))}</h3><p class="why">${esc(endMsg)}</p></div></li>`);
    }
    $("#p-timeline").classList.toggle("h12", MBB.h12());
    $("#p-timeline").innerHTML = li.join("");
  }

  function generate() { readForm(); rulePlan = plan(); render(rulePlan); $("#p-undo").hidden = true; }

  function planText() {
    const c = city();
    const lines = [t("plan.copyHead", { c: L(c), a: clock(win.start), b: clock(win.end) })];
    current.stops.forEach(s => {
      const n = stopNames(s);
      if (s.leg) lines.push(`   ↓ ${t(s.leg.mode === "walk" ? "plan.walk" : "plan.car")} ${t("plan.legMin", { m: s.leg.min })}`);
      else if (s.legText) lines.push(`   ↓ ${s.legText}`);
      lines.push(`${clock(s.start)}–${clock(s.end)}  ${n.main}${n.sub ? `（${n.sub}）` : ""}`);
      const tip = s.tip || (s.poi ? L(s.poi.tip) : "");
      if (tip) lines.push(`   ${t("plan.tip")}${tip}`);
    });
    if (prefs.flightOn) lines.push(`${clock(win.end)}  ${t("plan.copyLeave", { a: L(c.airport) })}`);
    lines.push(t("plan.copyFoot"));
    return lines.join("\n");
  }

  /* ---------- the AI's update_plan tool lands here ---------- */
  function applyAI(input) {
    const byId = Object.fromEntries(MBB.C.pois.map(p => [p.id, p]));
    const okT = v => /^\d{1,2}:\d{2}$/.test(String(v || ""));
    const bad = [];
    const raw = Array.isArray(input?.stops) ? input.stops : [];
    const stops = raw.map((s, i) => {
      if (!s || typeof s !== "object") { bad.push(`stop ${i + 1}: not an object`); return null; }
      if (!okT(s.start) || !okT(s.end)) { bad.push(`stop ${i + 1}: start/end must be HH:MM`); return null; }
      const p = s.id ? byId[String(s.id)] : null;
      if (s.id && !p && !s.name) { bad.push(`stop ${i + 1}: unknown id "${s.id}" and no name`); return null; }
      if (!p && !s.name && !s.en) { bad.push(`stop ${i + 1}: needs an id or a name`); return null; }
      let st = toMin(s.start), en = toMin(s.end);
      if (st < win.start - 60) st += 1440;
      if (en < st) en += 1440;
      return {
        poi: p || null, name: String(s.name || "").slice(0, 80), en: String(s.en || "").slice(0, 80),
        start: st, end: en, why: String(s.why || "").slice(0, 300), tip: String(s.tip || "").slice(0, 300),
        legText: String(s.travel || "").slice(0, 80),
      };
    }).filter(Boolean);
    if (!stops.length) throw new Error("No valid stops. " + bad.join("; "));
    render({ stops, source: "ai", title: input.title ? String(input.title).slice(0, 120) : "", intro: input.intro ? String(input.intro).slice(0, 300) : "" });
    $("#p-undo").hidden = false;
    MBB.emit("plan-updated");
    return bad.length ? `Plan updated, but some stops were skipped: ${bad.join("; ")}` : "ok: the plan on screen now shows these stops";
  }

  // What Miiuz sees about the traveller's plan.
  function snapshot() {
    readForm();
    return {
      city: MBB.state.city, start: fmt(win.start), end: fmt(win.end),
      flight: prefs.flightOn ? prefs.flight : null,
      persona: prefs.persona, themes: [...prefs.themes], group: prefs.group, budget: prefs.budget,
      indoor: prefs.rain, lessWalking: prefs.nowalk,
      stops: (current?.stops || []).map(s => `${fmt(s.start)}-${fmt(s.end)} ${s.poi ? s.poi.id + " " + s.poi.en : (s.en || s.name)}`),
      source: current?.source || "rule",
    };
  }

  function init() {
    buildForm();
    $("#prefs").addEventListener("submit", e => { e.preventDefault(); generate(); });
    $("#prefs").addEventListener("change", e => { if (e.target.id !== "p-flight-on") generate(); });
    $("#p-flight-on").addEventListener("change", () => { updateFlightHint(); generate(); });
    $("#p-shuffle").addEventListener("click", () => { seed = (seed * 31 + 17) % 100000; generate(); });
    $("#p-undo").addEventListener("click", () => { render(rulePlan); $("#p-undo").hidden = true; });
    $("#p-copy").addEventListener("click", () => {
      MBB.copy(planText()).then(ok => MBB.toast(ok ? t("plan.copied") : t("common.copyFail")));
    });
    $("#p-ask").addEventListener("click", e => { e.preventDefault(); MBB.chat.prefill(""); });
    MBB.on("lang", () => { buildForm(); if (current) render(current); });
    MBB.on("from", () => { if (current) render(current); });
    MBB.on("city", () => { buildForm(); generate(); });
    generate();
  }

  MBB.planner = { init, applyAI, snapshot, generate };
})();
