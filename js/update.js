/* Miiuz Beyond Borders — keeping travellers on the latest version (#30).
 * The service worker (sw.js) is registered as "sw.js?v=<build>", with the build from /api/config,
 * and serves each build's files from that build's own cache.
 *  - The build this page runs is the one of the worker that served it (or the live one when the
 *    page came from the network). Credits shows it with MBB.VERSION.
 *  - Coming back to the foreground, and every few hours, the app asks /api/config again. A new
 *    build is registered and installs in the background, then a bar says "A new version is
 *    ready · Update". Never while the traveller is typing or the SOS sheet is open.
 *  - Update reloads into the new build. Saved data (language, home country, plans, sign-in) is in
 *    localStorage and stays.
 *  - /api/config's minVersion (MIIUZ_MIN_VERSION), or a 426 from an API, shows a full-screen
 *    "Please update". Only for breaking API changes or wrong safety facts.
 * Offline nothing is checked, so the app opens on the last version it had. */
(function () {
  const MBB = window.MBB;
  const { $, $$, esc, t, icon } = MBB;
  const sw = "serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !window.claude ? navigator.serviceWorker : null;
  const EVERY = 3 * 60 * 60 * 1000; // check every 3 hours while open
  const SOON = 60 * 1000;           // but not more than once a minute

  const buildOf = w => { try { return new URL(w.scriptURL).searchParams.get("v"); } catch { return null; } };
  // null until /api/config answers when this page came from the network (first visit, or a copy
  // from before #30 that loads files from the network): then it's the live build.
  let running = sw?.controller ? buildOf(sw.controller) : null;
  let live = null, reg = null, lastCheck = 0, waitTimer = 0, outdated = false, reloading = false;

  const older = (a, b) => {
    const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
    return false;
  };

  async function register(build) {
    if (!sw || !build) return null;
    try { reg = await sw.register(`sw.js?v=${encodeURIComponent(build)}`); } catch { return null; }
    if (!reg.__mbb) {
      reg.__mbb = true;
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if (w.state === "installed") waiting(); });
      });
    }
    if (reg.waiting) waiting();
    return reg;
  }

  // A new build has installed and is waiting to take over.
  function waiting() {
    const w = reg?.waiting;
    if (!w || reloading) return;
    const next = buildOf(w);
    // Plain "sw.js" (copies from before #30) and local dev take over by themselves.
    if (!next || next === "dev") return;
    // This page already runs that build (its files came from the network or from that build's
    // cache): let the new worker take over quietly, nothing on screen changes.
    if (!running || running === "dev" || next === running) { w.postMessage("skipWaiting"); return; }
    offer();
  }

  /* ---------- "A new version is ready · Update" ---------- */
  function offer() {
    clearTimeout(waitTimer);
    const bar = $("#updbar");
    if (!bar || outdated) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
    if (typing || !$("#sos").hidden || !$("#present").hidden) { waitTimer = setTimeout(offer, 3000); return; }
    bar.innerHTML = `<div class="wrap trbar-in">${icon("download")}<span>${esc(t("update.ready"))}</span>
      <button type="button" class="btn btn-main btn-sm" id="upd-go">${esc(t("update.go"))}</button></div>`;
    bar.hidden = false;
    $("#upd-go").addEventListener("click", update);
  }

  /* ---------- update now ----------
   * Switch to the waiting build and reload. If none is waiting yet, install the live one first;
   * if that fails (for example a file didn't download), reload from the network without the
   * worker, so nobody gets stuck on an old copy. */
  async function update() {
    if (reloading) return;
    reloading = true;
    $$("#upd-go, #must-go, #cr-update").forEach(b => { b.disabled = true; });
    const reload = () => location.reload();
    if (!sw) return reload();
    sw.addEventListener("controllerchange", reload);
    try {
      if (!reg?.waiting && live && live !== running) {
        await register(live);
        await new Promise(done => {
          const until = Date.now() + 20000;
          (function poll() { if (reg?.waiting || Date.now() > until) done(); else setTimeout(poll, 250); })();
        });
      }
      if (reg?.waiting) { reg.waiting.postMessage("skipWaiting"); setTimeout(reload, 4000); return; }
      if (live && live !== running) { await reg?.unregister(); }
    } catch { /* reload anyway */ }
    reload();
  }

  /* ---------- "Please update" (minVersion, or 426 from an API) ---------- */
  function mustUpdate() {
    if (outdated) return;
    outdated = true;
    clearTimeout(waitTimer);
    $("#updbar").hidden = true;
    const el = $("#must-update");
    el.innerHTML = `<div class="present-in" role="alertdialog" aria-modal="true" aria-labelledby="must-title" aria-describedby="must-lead">
      <span class="badge-ic">${icon("download")}</span>
      <h2 id="must-title">${esc(t("update.must"))}</h2>
      <p id="must-lead">${esc(t("update.mustLead"))}</p>
      <button type="button" class="btn btn-main" id="must-go">${esc(t("update.go"))}</button>
      <a class="btn btn-ghost btn-sm" href="tel:999">${icon("phone")}${esc(t("home.sos"))} 999</a>
    </div>`; // an emergency call never waits for an update
    el.hidden = false;
    $("#must-go").addEventListener("click", update);
    $("#must-go").focus();
  }
  MBB.on("outdated", mustUpdate);

  /* ---------- checking ---------- */
  function seen(cfg) {
    if (!cfg) return; // offline: keep this version, no banner
    live = cfg.build || null;
    if (!running && live) {
      running = live;
      const v = $("#cr-version"); // Credits rendered before the build was known
      if (v) v.textContent = t("credits.version", { v: MBB.update.label() });
    }
    if (cfg.minVersion && older(MBB.VERSION, cfg.minVersion)) mustUpdate();
    if (live) register(live).then(r => r?.update().catch(() => {}));
  }
  async function check(force = false) {
    if (!force && Date.now() - lastCheck < SOON) return;
    lastCheck = Date.now();
    seen(await MBB.config(true));
  }

  function init() {
    if (!sw) return;
    MBB.config().then(cfg => { lastCheck = Date.now(); seen(cfg); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    setInterval(() => check(), EVERY);
  }

  // Credits: "Version 1.0.0 (abc1234)" and a "Check for updates" button.
  async function checkNow() {
    await check(true);
    if (outdated) return;
    if (reg?.waiting || (live && running && live !== running)) return update();
    MBB.toast(live ? t("update.latest") : t("update.offline"), { type: live ? "success" : "info" });
  }

  MBB.update = {
    init,
    checkNow,
    label: () => `${MBB.VERSION}${running ? ` (${running})` : ""}`,
  };
})();
