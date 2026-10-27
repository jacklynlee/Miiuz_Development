/* Miiuz Beyond Borders — routing, home dashboard, SOS sheet, start-up. */
(function () {
  const MBB = window.MBB;
  const { $, $$, esc, t, L, icon } = MBB;
  const VIEWS = ["home", "guide", "plan", "tools", "ask", "member"];
  let route = { view: "home" }, pendingScroll = null;

  /* ---------- routing (plain #name hashes: #home, #guide-money, …) ---------- */
  function parse() {
    const h = decodeURIComponent((location.hash || "").slice(1));
    if (h.startsWith("guide-")) return { view: "guide", sub: h.slice(6) };
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
  function renderHome() {
    const C = MBB.C;
    const now = MBB.localNow();
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
        <h1>${esc(t("home.title"))}</h1>
        <p class="lead">${esc(t("home.lead"))}</p>
        <div class="city-pick"><span>${esc(t("home.city"))}</span><div class="chips" id="h-city">${cityChips}</div></div>
      </section>

      <div class="glance">
        <div class="tile">
          <span class="k">${icon("clock")}${esc(t("home.time"))}</span>
          <span class="v" id="h-clock">${now.hhmm}</span>
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
          <span class="n">24–33°C</span>
        </div>
        <button type="button" class="tile sos" data-sos>
          <span class="k">${icon("phone")}${esc(t("home.sos"))}</span>
          <span class="v">999</span>
          <span class="n">${esc(t("home.sosNote"))}</span>
        </button>
      </div>

      <section>
        <div class="section-title"><h2>${esc(t("home.start"))}</h2></div>
        <div class="quick">
          ${quick("#guide-entry", "passport", "home.q.entry", "home.q.entryD", "hot")}
          ${quick("#guide-airport", "plane", "home.q.airport", "home.q.airportD")}
          ${quick("#guide-money", "coins", "home.q.money", "home.q.moneyD", "warm")}
          ${quick("#tools", "pin", "tools.driver", "tools.driverLead", "", "tool-driver")}
          ${quick("#plan", "plan", "home.q.plan", "home.q.planD")}
          ${quick("#ask", "spark", "home.q.ask", "home.q.askD")}
        </div>
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
    const inst = MBB.install.card();
    if (inst) { $(".glance").insertAdjacentHTML("afterend", inst); MBB.install.bind(); }
  }

  /* ---------- SOS sheet ---------- */
  let sosReturn = null;
  function renderSOS() {
    const C = MBB.C;
    const mine = MBB.store.get("sos", {});
    const hotel = MBB.store.get("hotel", "");
    $("#sos-sheet").innerHTML = `
      <div class="sheet-head">
        <div><h2 id="sos-title">${esc(t("sos.title"))}</h2><p>${esc(t("sos.lead"))}</p></div>
        <button type="button" class="btn btn-ghost btn-sm" id="sos-close">${esc(t("sos.close"))}</button>
      </div>
      <ul class="sos-list">${C.emergency.filter(e => !e.only || e.only.includes(MBB.state.lang)).map((e, i) => `
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
    const saveMine = () => MBB.store.set("sos", { embassy: $("#sos-embassy").value, insurance: $("#sos-ins").value });
    $("#sos-embassy").addEventListener("input", saveMine);
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
      const a = e.target.closest("a[data-scroll]");
      if (a) { e.preventDefault(); MBB.go(a.getAttribute("href").slice(1), a.dataset.scroll); }
    });

    MBB.on("lang", () => { buildLangSelect(); show(); if (!$("#sos").hidden) renderSOS(); });
    MBB.on("city", () => { if (route.view === "home" || route.view === "guide") show(); });
    MBB.on("fx", () => { if (route.view === "home") renderHome(); });
    MBB.on("check", () => { if (route.view === "home") renderHome(); });
    MBB.on("member", () => { if (route.view === "home") renderHome(); });
    MBB.on("install", () => { if (route.view === "home") renderHome(); });

    window.addEventListener("hashchange", show);
    show();

    setInterval(() => { const c = $("#h-clock"); if (c) c.textContent = MBB.localNow().hhmm; }, 20000);
    MBB.refreshFx();
    MBB.translator.ensure(MBB.state.lang);

    // Offline support when served as a web app (not available inside a Claude artifact).
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !window.claude) {
      try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch { /* ignore */ }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
