/* Miiuz Beyond Borders — routing, home dashboard, SOS sheet, start-up. */
(function () {
  const MBB = window.MBB;
  const { $, $$, esc, t, L, icon } = MBB;
  const VIEWS = ["home", "guide", "plan", "tools", "ask", "member", "search", "place", "credits"];
  let route = { view: "home" }, pendingScroll = null, moves = 0;

  /* ---------- routing (plain #name hashes: #home, #guide-money, …) ---------- */
  function parse() {
    const h = decodeURIComponent((location.hash || "").slice(1));
    if (h.startsWith("guide-")) return { view: "guide", sub: h.slice(6) };
    if (h.startsWith("place-")) return { view: "place", sub: h.slice(6) };
    return { view: VIEWS.includes(h) ? h : "home" };
  }
  function show() {
    const prev = route;
    route = parse();
    VIEWS.forEach(v => { $(`#view-${v}`).hidden = v !== route.view; });
    $$(".tabbar a").forEach(a => (a.dataset.tab === route.view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    if (route.view === "home") renderHome();
    if (route.view === "guide") MBB.guide.render(route.sub);
    if (route.view === "member") { MBB.member.hideNudge(false); MBB.member.render(); }
    if (route.view === "search") MBB.search.render();
    if (route.view === "place") MBB.place.render(route.sub);
    if (route.view === "credits") MBB.media.renderCredits($("#view-credits"));
    if (pendingScroll) {
      const el = document.getElementById(pendingScroll);
      pendingScroll = null;
      if (el) { requestAnimationFrame(() => el.scrollIntoView({ block: "start" })); return; }
    }
    if (prev.view !== route.view || prev.sub !== route.sub) window.scrollTo(0, 0);
  }
  MBB.go = (view, scrollId) => {
    pendingScroll = scrollId || null;
    const target = "#" + view;
    if (location.hash === target) show(); else location.hash = target;
  };

  /* ---------- home ---------- */
  function quick(href, ic, title, desc, tone = "", scroll = "") {
    return `<a href="${href}"${scroll ? ` data-scroll="${scroll}"` : ""}>
      <span class="badge-ic ${tone}">${icon(ic)}</span>
      <span><b>${esc(t(title))}</b><small>${esc(t(desc))}</small></span>
      ${icon("next", "next")}
    </a>`;
  }
  function gapText() {
    const g = MBB.tzGap();
    if (!g) return t("home.timeSame");
    return t(g > 0 ? "home.timeAhead" : "home.timeBehind", { h: Math.abs(g) });
  }

  /* ---------- home country: confirm once, change any time ---------- */
  // Native <select> laid over a button, so one tap opens the phone's own picker.
  function fromSelect(id, showCurrent) {
    const O = MBB.origin, cur = showCurrent ? MBB.state.from : null;
    let coll;
    try { coll = new Intl.Collator(MBB.locale()); } catch { coll = new Intl.Collator("en"); }
    const all = O.COUNTRIES.map(c => [c, MBB.countryName(c)]).sort((a, b) => coll.compare(a[1], b[1]));
    const opt = ([c, n]) => `<option value="${c}"${c === cur ? " selected" : ""}>${esc(n)}</option>`;
    return `<select id="${id}" aria-label="${esc(t("from.pick"))}">
      <option value="" disabled${cur ? "" : " selected"}>${esc(t("from.pick"))}</option>
      <optgroup label="${esc(t("member.natPopular"))}">${O.COMMON.map(c => opt([c, MBB.countryName(c)])).join("")}</optgroup>
      <optgroup label="${esc(t("member.natAll"))}">${all.map(opt).join("")}</optgroup>
      <option value="-"${showCurrent && !cur ? " selected" : ""}>${esc(t("from.none"))}</option>
    </select>`;
  }
  function fromCard() {
    if (MBB.state.fromOk) return "";
    const c = MBB.state.from;
    return `<section class="card from-card">
      <span class="badge-ic">${icon("globe")}</span>
      <div><b>${esc(c ? t("from.ask", { c: MBB.countryName(c) }) : t("from.askNone"))}</b><small>${esc(t("from.why"))}</small></div>
      <div class="actions">
        ${c ? `<button type="button" class="btn btn-main btn-sm" id="from-yes">${esc(t("from.yes"))}</button>` : ""}
        <label class="btn btn-ghost btn-sm pick">${esc(t(c ? "from.change" : "from.pick"))}${fromSelect("from-card-select", false)}</label>
      </div>
    </section>`;
  }
  function fromLine() {
    if (!MBB.state.fromOk) return "";
    const c = MBB.state.from;
    return `<div class="city-pick"><span>${esc(t("from.label"))}</span><label class="chip-link pick">${icon("globe")}${esc(c ? MBB.countryName(c) : t("from.none"))}${fromSelect("from-select", true)}</label></div>`;
  }
  function bindFrom() {
    const saved = code => MBB.toast(t("from.saved", { c: code ? MBB.countryName(code) : t("from.none") }));
    $$("#from-card-select, #from-select").forEach(s => s.addEventListener("change", e => {
      const v = e.target.value;
      if (!v) return;
      const code = v === "-" ? null : v;
      MBB.setFrom(code); saved(code);
    }));
    $("#from-yes")?.addEventListener("click", () => { MBB.setFrom(MBB.state.from); saved(MBB.state.from); });
  }

  /* ---------- "before you fly" or "in Malaysia" ---------- */
  // Follows the phone's time zone until the traveller picks; a pick lasts while the time zone says the same.
  function stage() {
    const s = MBB.store.get("stage", null);
    if (s && s.on === MBB.onTrip() && (s.s === "before" || s.s === "landed")) return s.s;
    return MBB.onTrip() ? "landed" : "before";
  }
  function quickList(st) {
    return st === "before"
      ? quick("#guide-entry", "passport", "home.q.entry", "home.q.entryD", "hot") +
        quick("#tools", "check", "home.check", "home.q.checkD", "warm", "tool-check") +
        quick("#guide-connect", "signal", "home.q.connect", "home.q.connectD") +
        quick("#guide-money", "coins", "home.q.money", "home.q.moneyD") +
        quick("#plan", "plan", "home.q.plan", "home.q.planD") +
        quick("#ask", "spark", "home.q.ask", "home.q.askD")
      : quick("#guide-entry", "passport", "home.q.entry", "home.q.entryD", "hot") +
        quick("#guide-airport", "plane", "home.q.airport", "home.q.airportD") +
        quick("#guide-money", "coins", "home.q.money", "home.q.moneyD", "warm") +
        quick("#tools", "pin", "tools.driver", "tools.driverLead", "", "tool-driver") +
        quick("#plan", "plan", "home.q.plan", "home.q.planD") +
        quick("#ask", "spark", "home.q.ask", "home.q.askD");
  }

  function renderHome() {
    const C = MBB.C;
    const now = MBB.localNow();
    const st = stage();
    const stageChips = ["before", "landed"].map(k =>
      `<div class="chip"><input type="radio" name="hstage" id="h-stage-${k}" value="${k}"${k === st ? " checked" : ""}><label for="h-stage-${k}">${esc(t(`home.stage.${k}`, { country: L(C.name) }))}</label></div>`).join("");
    const home = MBB.state.home, r = MBB.rate(home);
    let month;
    try { month = new Date(2026, now.month, 1).toLocaleDateString(MBB.locale(), { month: "long" }); } catch { month = String(now.month + 1); }
    const prog = MBB.tools.progress();
    const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
    const cityChips = Object.entries(C.cities).map(([k, c]) =>
      `<div class="chip"><input type="radio" name="hcity" id="h-city-${k}" value="${k}"${k === MBB.state.city ? " checked" : ""}><label for="h-city-${k}">${esc(L(c))}</label></div>`).join("");

    $("#view-home").innerHTML = `
      ${MBB.member.homeCard()}
      <section class="hero">
        <p class="eyebrow">${esc(t("home.eyebrow"))}</p>
        <p class="slogan"><span lang="ms">Cuti-cuti Malaysia!</span>${MBB.state.lang === "ms" ? "" : `<small>${esc(t("home.sloganGloss"))}</small>`}</p>
        <h1>${esc(t("home.title"))}</h1>
        <p class="lead">${esc(t("home.lead"))}</p>
        <a class="search-launch" href="#search" data-search>${icon("search")}<span>${esc(t("search.ph"))}</span></a>
        <div class="city-pick"><span>${esc(t("home.city"))}</span><div class="chips" id="h-city">${cityChips}<a class="chip-link" href="#search" data-search>${icon("search")}${esc(t("home.elsewhere"))}</a></div></div>
        ${fromLine()}
      </section>

      ${fromCard()}

      <div class="glance">
        <div class="tile">
          <span class="k">${icon("clock")}${esc(t("home.time"))}</span>
          <span class="v" id="h-clock">${esc(MBB.clock(now.minutes))}</span>
          <span class="n">${esc(gapText())}</span>
        </div>
        <a class="tile" href="#tools" data-scroll="tool-fx">
          <span class="k">${icon("coins")}${esc(t("home.rate"))}</span>
          <span class="v">${r ? `RM 100 ≈ ${esc(MBB.money(100 * r, home))}` : "RM"}</span>
          <span class="n">${r ? `1 ${esc(home)} ≈ RM ${(1 / r).toFixed(3)} · ` : ""}${esc(t(MBB.fx.live ? "home.rateLive" : "home.rateApprox"))}</span>
        </a>
        <div class="tile">
          <span class="k">${icon("sun")}${esc(t("home.weather", { m: month }))}</span>
          <span class="v text">${esc(L(C.climate[now.month]))}</span>
          <span class="n">${esc(MBB.temp(24, 33))}</span>
        </div>
        <button type="button" class="tile sos" data-sos>
          <span class="k">${icon("phone")}${esc(t("home.sos"))}</span>
          <span class="v">999</span>
          <span class="n">${esc(t("home.sosNote"))}</span>
        </button>
      </div>

      <section>
        <div class="section-title"><h2 id="h-start">${esc(t(st === "before" ? "home.startBefore" : "home.start"))}</h2></div>
        <div class="chips stage-pick" id="h-stage">${stageChips}</div>
        <div class="quick" id="h-quick">${quickList(st)}</div>
      </section>

      <section class="explore">
        <div class="section-title"><h2>${esc(t("explore.title"))}</h2><a href="#search" data-search>${esc(t("explore.all"))}</a></div>
        <p class="hint">${esc(t("explore.lead"))}</p>
        <div class="mymap-wrap">${MBB.maps.overview()}</div>
        <div class="strip">${C.destinations.map(MBB.place.destCard).join("")}</div>
      </section>

      <section>
        <div class="section-title"><h2>${esc(t("home.food"))}</h2><a href="#guide-food">${esc(t("home.more"))}</a></div>
        <div class="strip">${(C.guide.find(g => g.id === "food")?.dishes || []).map((d, i) => `<a class="pic-card" href="#guide-food" data-scroll="dish-${i}">
          ${MBB.media.html(`dish:${i}`, { alt: "", ic: "bowl" })}<span><b>${esc(d.ms)}</b><small>${esc(L(d))}</small></span></a>`).join("")}</div>
      </section>

      <section>
        <div class="section-title"><h2>${esc(t("home.souvenirs"))}</h2><a href="#guide-shopping">${esc(t("home.more"))}</a></div>
        <div class="strip">${C.souvenirs.map(sv => `<a class="pic-card" href="#guide-shopping" data-scroll="souv-${sv.id}">
          ${MBB.media.html(`souv:${sv.id}`, { alt: "", ic: "gift" })}<span><b>${esc(L(sv.name))}</b><small>${esc(L(sv.desc))}</small></span></a>`).join("")}</div>
      </section>

      <section>
        <div class="section-title"><h2>${esc(t("home.guide"))}</h2><a href="#guide">${esc(t("home.allTopics"))}</a></div>
        <div class="topics">${C.guide.map(MBB.guide.topicCard).join("")}</div>
      </section>

      <section class="card progress">
        <div class="section-title"><h2>${esc(t("home.check"))}</h2><a href="#tools" data-scroll="tool-check">${esc(t("home.checkOpen"))}</a></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${prog.total}" aria-valuenow="${prog.done}"><i style="width:${pct}%"></i></div>
        <p class="hint">${esc(t("home.checkProgress", { n: prog.done, total: prog.total }))}</p>
      </section>`;

    $("#h-city").addEventListener("change", e => MBB.setCity(e.target.value));
    $("#h-stage").addEventListener("change", e => {
      const s = e.target.value;
      MBB.store.set("stage", { s, on: MBB.onTrip() });
      $("#h-start").textContent = t(s === "before" ? "home.startBefore" : "home.start");
      $("#h-quick").innerHTML = quickList(s); // only the list changes, so focus stays on the chip
    });
    bindFrom();
    const inst = MBB.install.card();
    if (inst) { $(".glance").insertAdjacentHTML("afterend", inst); MBB.install.bind(); }
  }

  /* ---------- SOS sheet ---------- */
  let sosReturn = null;
  function renderSOS() {
    const C = MBB.C;
    const mine = MBB.store.get("sos", {});
    const prof = MBB.member.state.profile || {};
    const em = prof.emergency_phone ? prof : null;
    const hotel = MBB.store.get("hotel", "");
    $("#sos-sheet").innerHTML = `
      <div class="sheet-head">
        <div><h2 id="sos-title">${esc(t("sos.title"))}</h2><p>${esc(t("sos.lead"))}</p></div>
        <button type="button" class="btn btn-ghost btn-sm" id="sos-close">${esc(t("sos.close"))}</button>
      </div>
      <ul class="sos-list">${C.emergency.filter(MBB.forMe).map((e, i) => `
        <li class="${i === 0 ? "primary" : ""}">
          <span class="num">${esc(e.num)}</span>
          <span class="lbl">${esc(L(e.label))}</span>
          <div class="acts">
            <a class="icon-btn" href="tel:${esc(e.tel)}">${icon("phone")}${esc(t("sos.call"))}</a>
            <button type="button" class="icon-btn" data-copy="${esc(e.num)}" aria-label="${esc(t("sos.copy"))} ${esc(e.num)}">${icon("copy")}</button>
          </div>
          <span class="note">${esc(L(e.note))}</span>
        </li>`).join("")}
      </ul>
      <div class="sos-block">
        <h3>${esc(t("sos.location"))}</h3>
        <div class="actions">
          <button type="button" class="btn btn-ghost btn-sm" id="sos-locate">${icon("pin")}${esc(t("sos.locate"))}</button>
          <a class="btn btn-ghost btn-sm" href="https://www.google.com/maps/search/hospital/" target="_blank" rel="noopener">${icon("cross")}${esc(t("sos.hospital"))}</a>
          <a class="btn btn-ghost btn-sm" href="https://www.google.com/maps/search/police+station/" target="_blank" rel="noopener">${icon("shield")}${esc(t("sos.police"))}</a>
        </div>
        <div id="sos-loc" hidden></div>
      </div>
      <div class="sos-block">
        <h3>${esc(t("sos.mine"))}</h3>
        ${em ? `<div class="sos-em"><span><b>${esc(t("sos.emergencyContact"))}</b><small>${esc([em.emergency_name, em.emergency_relation].filter(Boolean).join(" · "))} ${esc(em.emergency_phone)}</small></span>
          <a class="icon-btn" href="tel:${esc(em.emergency_phone)}">${icon("phone")}${esc(t("sos.call"))}</a></div>`
          : `<label for="sos-em">${esc(t("sos.emergencyLocal"))}<input type="text" id="sos-em" inputmode="text" value="${esc(mine.emergency || "")}"></label>`}
        <label for="sos-hotel">${esc(t("sos.hotel"))}<textarea id="sos-hotel" rows="2" placeholder="${esc(t("tools.driverPh"))}">${esc(hotel)}</textarea></label>
        <div class="actions"><button type="button" class="btn btn-main btn-sm" id="sos-driver">${icon("expand")}${esc(t("tools.driverShow"))}</button></div>
        <label for="sos-embassy">${esc(t("sos.embassy"))}<input type="text" id="sos-embassy" inputmode="tel" value="${esc(mine.embassy || "")}"></label>
        <label for="sos-ins">${esc(t("sos.insurance"))}<input type="text" id="sos-ins" inputmode="tel" value="${esc(mine.insurance || "")}"></label>
        <p class="hint">${esc(t("sos.mineNote"))}</p>
      </div>`;

    $("#sos-close").addEventListener("click", closeSOS);
    $$("[data-copy]", $("#sos-sheet")).forEach(b => b.addEventListener("click", () => {
      MBB.copy(b.dataset.copy).then(ok => MBB.toast(ok ? t("sos.copied", { x: b.dataset.copy }) : t("common.copyFail")));
    }));
    $("#sos-locate").addEventListener("click", locate);
    $("#sos-hotel").addEventListener("input", e => { MBB.store.set("hotel", e.target.value); MBB.emit("hotel"); });
    const saveMine = () => MBB.store.set("sos", { ...MBB.store.get("sos", {}), embassy: $("#sos-embassy").value, insurance: $("#sos-ins").value, ...($("#sos-em") ? { emergency: $("#sos-em").value } : {}) });
    $("#sos-embassy").addEventListener("input", saveMine);
    $("#sos-em")?.addEventListener("input", saveMine);
    $("#sos-ins").addEventListener("input", saveMine);
    $("#sos-driver").addEventListener("click", () => { closeSOS(); MBB.tools.showDriver(); });
  }
  function locate() {
    const out = $("#sos-loc");
    out.hidden = false;
    out.innerHTML = `<p class="hint">${esc(t("sos.locating"))}</p>`;
    const fail = () => { out.innerHTML = `<p class="hint">${esc(t("sos.locFail"))}</p>`; };
    try {
      if (!navigator.geolocation) return fail();
      navigator.geolocation.getCurrentPosition(pos => {
        const ll = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        const url = `https://www.google.com/maps?q=${encodeURIComponent(ll)}`;
        out.innerHTML = `<p class="loc-out">${esc(ll)}</p>
          <div class="actions">
            <a class="btn btn-ghost btn-sm" href="${url}" target="_blank" rel="noopener">${icon("external")}${esc(t("sos.locOpen"))}</a>
            <button type="button" class="btn btn-ghost btn-sm" id="sos-loc-copy">${icon("copy")}${esc(t("sos.copy"))}</button>
          </div>`;
        $("#sos-loc-copy").addEventListener("click", () => MBB.copy(`${ll}\n${url}`).then(ok => MBB.toast(ok ? t("sos.copied", { x: ll }) : t("common.copyFail"))));
      }, fail, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    } catch { fail(); }
  }
  function openSOS() {
    sosReturn = document.activeElement;
    renderSOS();
    $("#sos").hidden = false;
    $("#sos-close").focus();
  }
  function closeSOS() {
    if ($("#sos").hidden) return;
    $("#sos").hidden = true;
    sosReturn?.focus?.();
  }

  /* ---------- start-up ---------- */
  // Hand-translated languages first, then the ones Miiuz AI translates on first use.
  function buildLangSelect() {
    const opt = ([k, l]) => `<option value="${k}" lang="${l.tag}"${k === MBB.state.lang ? " selected" : ""}>${esc(l.native)}</option>`;
    const all = Object.entries(MBB.LANGS);
    $("#lang-select").innerHTML =
      `<optgroup label="${esc(t("lang.full"))}">${all.filter(([, l]) => l.full).map(opt).join("")}</optgroup>` +
      `<optgroup label="${esc(t("lang.ai"))}">${all.filter(([, l]) => !l.full).map(opt).join("")}</optgroup>`;
    const cur = MBB.LANGS[MBB.state.lang];
    $("#lang-short").textContent = cur.short || MBB.state.lang.toUpperCase();
    $("#lang-select").title = cur.native;
  }

  function init() {
    MBB.applyDir();
    $$("[data-icon]").forEach(el => { el.innerHTML = icon(el.dataset.icon); });
    MBB.applyStatic();
    buildLangSelect();

    MBB.planner.init();
    MBB.tools.init();
    MBB.chat.init();
    MBB.member.init();

    $("#lang-select").addEventListener("change", e => MBB.setLang(e.target.value));
    $("#sos-open").addEventListener("click", openSOS);
    $("#member-btn").addEventListener("click", () => MBB.go("member"));
    $("#nudge").addEventListener("click", e => { if (e.target.id === "nudge") MBB.member.hideNudge(); });
    $("#sos").addEventListener("click", e => { if (e.target.id === "sos") closeSOS(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") { MBB.closePresent(); closeSOS(); MBB.member.hideNudge(); } });
    document.addEventListener("click", e => {
      if (e.target.closest("#present-close")) { MBB.closePresent(); return; }
      if (e.target.closest("[data-sos]")) { openSOS(); return; }
      // Open search and focus the box in the same tap, so phones show the keyboard.
      if (e.target.closest("a[data-search]")) {
        e.preventDefault();
        if (location.hash !== "#search") { history.pushState(null, "", "#search"); moves++; show(); }
        MBB.search.focus();
        return;
      }
      // "Back" links return to the previous screen when there is one in this visit.
      if (e.target.closest("a[data-back]") && moves > 0) { e.preventDefault(); history.back(); return; }
      const a = e.target.closest("a[data-scroll]");
      if (a) { e.preventDefault(); MBB.go(a.getAttribute("href").slice(1), a.dataset.scroll); }
    });

    MBB.on("lang", () => { buildLangSelect(); show(); if (!$("#sos").hidden) renderSOS(); });
    MBB.on("from", () => { show(); if (!$("#sos").hidden) renderSOS(); });
    // Home-country hints that arrive after start-up. Malaysia is ignored (see js/country.js).
    MBB.config().then(cfg => MBB.hintFrom("ip", cfg?.country));
    MBB.on("member", () => MBB.hintFrom("member", MBB.member.state.profile?.nationality));
    MBB.on("city", () => { if (route.view === "home" || route.view === "guide") show(); });
    MBB.on("fx", () => { if (route.view === "home") renderHome(); });
    MBB.on("check", () => { if (route.view === "home") renderHome(); });
    MBB.on("member", () => { if (route.view === "home") renderHome(); });
    MBB.on("install", () => { if (route.view === "home") renderHome(); });
    MBB.on("media", () => { if (route.view === "home") renderHome(); if (route.view === "guide" && route.sub) MBB.guide.render(route.sub); });

    window.addEventListener("hashchange", () => { moves++; show(); });
    show();

    setInterval(() => { const c = $("#h-clock"); if (c) c.textContent = MBB.clock(MBB.localNow().minutes); }, 20000);
    MBB.refreshFx();
    MBB.media.load();
    MBB.translator.ensure(MBB.state.lang);

    // Offline support when served as a web app (not available inside a Claude artifact).
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !window.claude) {
      try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch { /* ignore */ }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
