/* Miiuz Beyond Borders — shared helpers: state, i18n lookup, storage, icons, overlays. */
(function () {
  const MBB = (window.MBB = window.MBB || {});

  /* ---------- storage (per-device conveniences only; every access may throw) ---------- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem("mbb." + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("mbb." + key, JSON.stringify(value)); } catch { /* private mode etc. */ }
    },
  };
  MBB.store = store;

  /* ---------- this copy's version (#30) ----------
   * Same as package.json's "version" (npm run check makes sure). Shown on Credits and sent to the
   * APIs as X-Miiuz-Version. The build (commit) comes from the service worker: js/update.js. */
  MBB.VERSION = "1.0.0";

  /* ---------- saved data format (#30) ----------
   * Settings and plans are saved as "mbb.*" in localStorage. When a release changes how something
   * is saved, raise DATA_VERSION and add a step that converts the old format, so nothing is lost:
   *   2: () => { const p = store.get("plan.prefs", null); if (p) store.set("plan.prefs", { ...p, … }); },
   * Steps run once, in order, before anything reads the data. */
  const DATA_VERSION = 1;
  const MIGRATE = {};
  {
    let v = store.get("dataVersion", 0);
    if (v === 0) v = 1; // everything saved before #30 is format 1
    for (; v < DATA_VERSION; v++) { try { MIGRATE[v + 1]?.(); } catch { /* keep going with what's there */ } }
    if (store.get("dataVersion", 0) !== DATA_VERSION) store.set("dataVersion", DATA_VERSION);
  }

  /* ---------- languages and home country ---------- */
  // The language list lives in js/locales.js, the home-country rules in js/country.js.
  const O = MBB.origin;
  const phoneLangs = navigator.languages || [navigator.language];
  let phoneTz = "";
  try { phoneTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* old browser */ }
  // Guess signals; the server's IP country and a member's nationality arrive later (MBB.hintFrom).
  const sig = { member: "", timeZone: phoneTz, ip: store.get("ipc", ""), languages: phoneLangs };

  // Phone language first. If the app doesn't have it, the home country's language, else English.
  let lang = store.get("lang", null);
  if (!MBB.LANGS[lang]) lang = MBB.negotiateLang(phoneLangs, null) || O.COUNTRY_LANG[O.detect(sig).code] || "en";

  // Dates, times and numbers: the language, written the home country's way (English + US → en-US).
  // Only combinations the browser really knows are used; otherwise the language's own locale.
  let loc = { key: "", value: "" };
  MBB.locale = () => {
    const info = MBB.LANGS[MBB.state.lang], c = MBB.state.from, key = MBB.state.lang + "|" + c;
    if (loc.key === key) return loc.value;
    let value = info.locale;
    if (c && c !== "MY") {
      const base = { zh: "zh-Hans", "zh-Hant": "zh-Hant", yue: "zh-Hant" }[MBB.state.lang] || info.locale.split("-")[0];
      const want = MBB.state.lang === "zh" && c === "CN" ? "zh-CN" : `${base}-${c}`;
      try { if (new Intl.DateTimeFormat(want).resolvedOptions().locale === want) value = want; } catch { /* keep the language's */ }
    }
    loc = { key, value };
    return value;
  };
  MBB.applyDir = () => {
    const info = MBB.LANGS[MBB.state.lang];
    document.documentElement.lang = info.tag;
    document.documentElement.dir = info.rtl ? "rtl" : "ltr";
  };

  /* ---------- state ---------- */
  // country = the destination's data pack. from = the traveller's home country (null = not known / not said).
  // fromOk = the traveller confirmed or chose it, so guesses no longer change it.
  const saved = store.get("from", null);
  const first = saved ? { code: O.valid(saved.c) ? saved.c : null, by: "user" } : O.detect({ ...sig, lang });
  MBB.state = {
    lang,
    country: "my",
    city: store.get("city", "kl"),
    from: first.code, fromBy: first.by, fromOk: Boolean(saved),
    // Home currency: the traveller's own pick in the converter, else the home country's, else the language's.
    home: store.get("home", O.currencyOf(first.code) || MBB.LANGS[lang].currency),
  };
  MBB.C = MBB.countries[MBB.state.country];

  // Features that are built but not released yet. Ask Miiuz (the AI chat) ships after v1.0.0 (#13, #33):
  // while it's off, every way into the chat is hidden and #ask shows "Coming soon". It has no tab (#49).
  // AI translation is separate and stays on. Set ask to true to switch the chat back on.
  MBB.features = { ask: false };
  if (!MBB.C.cities[MBB.state.city]) MBB.state.city = "kl";

  /* ---------- translation overlays (js/data/<country>.<lang>.js) ---------- */
  // Each overlay adds a language to the base pack's { zh, en } objects. Lists are matched by position.
  function applyOverlay(C, l, o) {
    const set = (obj, val) => { if (obj && typeof obj === "object" && val != null) obj[l] = val; };
    set(C.name, o.name); set(C.currency.name, o.currencyName);
    for (const [k, v] of Object.entries(o.cities || {})) {
      const c = C.cities[k]; if (!c) continue;
      c[l] = v.name; set(c.airport, v.airport); set(c.transferNote, v.transferNote);
    }
    for (const p of C.pois) { const v = o.pois?.[p.id]; if (v) { p[l] = v[0]; set(p.why, v[1]); set(p.tip, v[2]); } }
    for (const e of C.emergency) { const v = o.emergency?.[e.id]; if (v) { set(e.label, v[0]); set(e.note, v[1]); } }
    (o.climate || []).forEach((s, i) => set(C.climate[i], s));
    for (const g of C.guide) {
      const v = o.guide?.[g.id]; if (!v) continue;
      set(g.title, v.title); set(g.lead, v.lead);
      (v.facts || []).forEach(([k, val], i) => { if (g.facts?.[i]) { set(g.facts[i].k, k); set(g.facts[i].v, val); } });
      (v.sections || []).forEach(([h, items], i) => { const s = g.sections[i]; if (!s) return; set(s.h, h); items.forEach((it, j) => set(s.items[j], it)); });
      (v.links || []).forEach((label, i) => set(g.links?.[i]?.label, label));
      (v.dishes || []).forEach((d, i) => { if (g.dishes?.[i]) g.dishes[i][l] = d; });
    }
    for (const c of C.phrases) { const v = o.phrases?.[c.id]; if (v) { set(c.title, v.title); v.items.forEach((s, i) => { if (c.items[i]) c.items[i][l] = s; }); } }
    for (const g of C.checklist) { const v = o.checklist?.[g.id]; if (v) { set(g.title, v.title); for (const it of g.items) if (v.items[it.id]) it[l] = v.items[it.id]; } }
    if (o.driverCard) C.driverCard[l] = o.driverCard;
  }
  for (const [key, overlay] of Object.entries(MBB.overlays || {})) {
    const [country, l] = key.split(".");
    if (MBB.countries[country]) applyOverlay(MBB.countries[country], l, overlay);
  }

  /* ---------- events ---------- */
  const bus = new EventTarget();
  MBB.on = (name, fn) => bus.addEventListener(name, e => fn(e.detail));
  MBB.emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

  MBB.setLang = l => {
    if (l === MBB.state.lang) return;
    if (!MBB.LANGS[l]) return;
    MBB.state.lang = l; store.set("lang", l);
    MBB.applyDir();
    MBB.applyStatic();
    MBB.emit("lang", l);
    MBB.translator?.ensure(l); // AI-translated languages fill in as their text arrives
  };
  MBB.setCity = c => {
    if (!MBB.C.cities[c] || c === MBB.state.city) return;
    MBB.state.city = c; store.set("city", c);
    MBB.emit("city", c);
  };
  MBB.setHome = cur => {
    MBB.state.home = cur; store.set("home", cur);
    MBB.emit("fx");
  };
  // The traveller confirmed or chose their home country (null = prefer not to say). Currency follows it.
  MBB.setFrom = code => {
    code = O.valid(code) ? code : null;
    store.set("from", { c: code });
    Object.assign(MBB.state, { from: code, fromBy: "user", fromOk: true });
    const cur = O.currencyOf(code);
    if (cur) { MBB.state.home = cur; store.set("home", cur); }
    MBB.emit("from"); MBB.emit("fx");
  };
  // A new guess signal: "ip" (country of the request, from /api/config) or "member" (profile nationality).
  // Ignored once the traveller has chosen. Currency only follows if they never picked one themselves.
  MBB.hintFrom = (key, value) => {
    value = O.valid(value) ? value : "";
    if (sig[key] === value) return;
    sig[key] = value;
    if (key === "ip" && value && value !== "MY") store.set("ipc", value); // remembered for offline and later visits
    if (MBB.state.fromOk) return;
    const g = O.detect({ ...sig, lang: MBB.state.lang });
    MBB.state.fromBy = g.by;
    if (g.code === MBB.state.from) return;
    MBB.state.from = g.code;
    const cur = O.currencyOf(g.code);
    if (cur && store.get("home", null) == null) MBB.state.home = cur;
    MBB.emit("from"); MBB.emit("fx");
  };
  MBB.countryName = code => {
    if (!code) return "";
    try { return new Intl.DisplayNames([MBB.locale(), "en"], { type: "region" }).of(code) || code; } catch { return code; }
  };
  // Country-specific lines (`for: ["CN"]`): shown to travellers from that country and to members of that nationality.
  MBB.forMe = x => !x.for || x.for.includes(MBB.state.from) || x.for.includes(MBB.member?.state?.profile?.nationality);
  // Is the phone on Malaysian time? Then the traveller has most likely arrived.
  MBB.onTrip = () => O.LOCAL_TZ.includes(phoneTz);

  // Calls to our own /api/…, with this copy's version. A 426 means this copy is too old for the
  // API (MIIUZ_MIN_VERSION): js/update.js shows "Please update".
  MBB.api = (path, opts = {}) => fetch(path, { ...opts, headers: { ...opts.headers, "X-Miiuz-Version": MBB.VERSION } }).then(r => {
    if (r.status === 426) MBB.emit("outdated");
    return r;
  });

  // Public settings from the server (Supabase keys, the request's country, the live version and
  // build). Fetched once per visit; fresh = ask again (the update check, js/update.js).
  let cfg = null;
  const getConfig = () => MBB.api("api/config", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  MBB.config = (fresh = false) => {
    if (!fresh) return (cfg ||= getConfig());
    const p = getConfig();
    p.then(j => { if (j) cfg = Promise.resolve(j); });
    return p;
  };

  /* ---------- text ---------- */
  MBB.L = v => {
    if (v == null) return "";
    if (typeof v !== "object" || Array.isArray(v)) return v;
    return v[MBB.state.lang] ?? v.en ?? v.zh ?? "";
  };
  // A place's display name: localized where an overlay provides one, else its local/English name.
  MBB.placeName = p => (MBB.state.lang === "en" ? p.en : (p[MBB.state.lang] || p.en));
  MBB.t = (key, vars) => {
    const entry = MBB.STR[key];
    let s = entry ? MBB.L(entry) : key;
    if (vars && typeof s === "string") s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
    return s;
  };
  MBB.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  MBB.$ = (sel, root = document) => root.querySelector(sel);
  MBB.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Fill every [data-i18n] / [data-i18n-ph] / [data-i18n-aria] element.
  MBB.applyStatic = (root = document) => {
    MBB.$$("[data-i18n]", root).forEach(el => { el.textContent = MBB.t(el.dataset.i18n); });
    MBB.$$("[data-i18n-ph]", root).forEach(el => { el.placeholder = MBB.t(el.dataset.i18nPh); });
    MBB.$$("[data-i18n-aria]", root).forEach(el => { el.setAttribute("aria-label", MBB.t(el.dataset.i18nAria)); });
  };

  /* ---------- time ---------- */
  MBB.toMin = s => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
  // HH:MM, for data (time inputs, the plan sent to Miiuz). Use MBB.clock for what travellers read.
  MBB.fmt = m => { m = Math.round(m); const h = Math.floor(m / 60) % 24, mm = ((m % 60) + 60) % 60; return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };
  // Clock time to show: 14:30, or 2:30 PM where the home country reads 12-hour time.
  MBB.h12 = () => O.H12.has(MBB.state.from);
  MBB.clock = m => {
    const s = MBB.fmt(m);
    if (!MBB.h12()) return s;
    const [h, mm] = s.split(":").map(Number);
    try { return new Intl.DateTimeFormat(MBB.locale(), { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(Date.UTC(2026, 0, 1, h, mm)); } catch { return s; }
  };

  /* ---------- units (miles and °F for travellers from the US, metric in brackets) ---------- */
  MBB.imperial = () => MBB.state.from === "US";
  MBB.dist = km => {
    const metric = km < 1 ? MBB.t("place.m", { n: Math.max(50, Math.round(km * 20) * 50) }) : MBB.t("place.km", { n: km < 10 ? km.toFixed(1) : Math.round(km) });
    if (!MBB.imperial()) return metric;
    const mi = km * 0.621371;
    const us = mi < 0.1 ? MBB.t("place.ft", { n: Math.max(100, Math.round((mi * 5280) / 50) * 50) }) : MBB.t("place.mi", { n: mi < 10 ? mi.toFixed(1) : Math.round(mi) });
    return `${us} (${metric})`;
  };
  MBB.temp = (lo, hi) => {
    const c = `${lo}–${hi}°C`;
    if (!MBB.imperial()) return c;
    const f = x => Math.round((x * 9) / 5 + 32);
    return `${f(lo)}–${f(hi)}°F (${c})`;
  };
  // Clock and weekday in the destination's time zone, whatever the phone is set to.
  MBB.localNow = () => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: MBB.C.timezone, hour: "2-digit", minute: "2-digit", weekday: "short", month: "numeric", day: "numeric", hourCycle: "h23" })
      .formatToParts(new Date()).reduce((o, p) => ((o[p.type] = p.value), o), {});
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute), month: Number(parts.month) - 1, hhmm: `${parts.hour}:${parts.minute}` };
  };
  // Hours between destination and phone (positive = destination ahead).
  MBB.tzGap = () => {
    const now = new Date();
    const p = new Intl.DateTimeFormat("en-US", { timeZone: MBB.C.timezone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(now).reduce((o, x) => ((o[x.type] = Number(x.value)), o), {});
    const destOffset = (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(now.getTime() / 6e4) * 6e4) / 6e4;
    const deviceOffset = -now.getTimezoneOffset();
    return Math.round((destOffset - deviceOffset) / 30) / 2;
  };

  /* ---------- currency ---------- */
  const fxSaved = store.get("fx", null);
  MBB.fx = fxSaved && fxSaved.rates ? fxSaved : { rates: MBB.C.rates, live: false, updated: null };
  MBB.rate = cur => (cur === MBB.C.currency.code ? 1 : MBB.fx.rates[cur] ?? MBB.C.rates[cur] ?? null); // 1 MYR = x cur
  MBB.refreshFx = async (force) => {
    const fresh = MBB.fx.live && MBB.fx.updated && Date.now() - MBB.fx.updated < 6 * 36e5;
    if (fresh && !force) return true;
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/" + MBB.C.currency.code, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      if (data.result !== "success" || !data.rates) throw new Error("bad data");
      MBB.fx = { rates: data.rates, live: true, updated: Date.now() };
      store.set("fx", MBB.fx);
      MBB.emit("fx");
      return true;
    } catch {
      return false;
    }
  };
  MBB.money = (n, cur) => {
    const digits = ["JPY", "KRW", "IDR", "VND"].includes(cur) ? 0 : 2;
    try { return new Intl.NumberFormat(MBB.locale(), { style: "currency", currency: cur, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n); }
    catch { return `${cur} ${n.toFixed(digits)}`; }
  };
  MBB.rm = n => `RM ${n.toFixed(2)}`;

  /* ---------- RM prices in text, with the home-currency amount (#19) ----------
   * Content and strings keep plain "RM55" in every language (AI translations keep it too), and the
   * app adds "(≈ US$13)" after each one: "RM1–RM10", "RM30–100", "RM1~RM10" and "RM100+" count as
   * one price. Uses the live rate when online and the saved one offline; "≈" marks it as approximate.
   * Nothing is added when the home currency is the ringgit. On a new rate or home currency the
   * amounts update in place ([data-fx]), without re-rendering the screen. */
  const RM_PRICE = /\bRM\s?(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s?[–~〜～-]\s?(?:RM\s?)?(\d+(?:,\d{3})*(?:\.\d+)?))?(\+)?/g;
  const approxMoney = (n, cur) => {
    if (n >= 1000) { const step = 10 ** (Math.floor(Math.log10(n)) - 1); n = Math.round(n / step) * step; } // ₩9,977 → ₩10,000
    const digits = ["JPY", "KRW", "IDR", "VND"].includes(cur) || n >= 10 ? 0 : 2;
    try { return new Intl.NumberFormat(MBB.locale(), { style: "currency", currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n); }
    catch { return `${cur} ${n.toFixed(digits)}`; }
  };
  const fxSuffix = (a, b, plus) => {
    const home = MBB.state.home, r = home && home !== "MYR" ? MBB.rate(home) : null;
    if (!r) return "";
    const v = x => approxMoney(Number(String(x).replace(/,/g, "")) * r, home);
    const s = MBB.t("fx.approx", { v: (b ? `${v(a)}–${v(b)}` : v(a)) + (plus || "") });
    return s.startsWith("（") ? s : " " + s; // full-width brackets (Chinese, Japanese) need no space
  };
  // Escaped HTML for a text that may contain RM prices. Use it instead of esc() wherever prices can appear.
  MBB.priceHtml = text => MBB.esc(text).replace(RM_PRICE, (m, a, b, plus) =>
    `${m}<span class="fx" data-fx="${a}|${b || ""}|${plus || ""}">${MBB.esc(fxSuffix(a, b, plus))}</span>`);
  MBB.on("fx", () => MBB.$$("[data-fx]").forEach(el => { el.textContent = fxSuffix(...el.dataset.fx.split("|")); }));

  /* ---------- feedback ---------- */
  /* ---------- toasts (#29) ----------
   * MBB.toast(msg) or MBB.toast(msg, { type: "success" | "error" | "info", action: { label, run } }).
   * A card at the top of the screen, below the notch, above everything else (sheets, the
   * full-screen card). Success and info stay about 3 s, errors about 5.5 s; it stays while
   * touched or hovered, and a tap, a swipe up or × dismisses it. A new toast replaces the current
   * one. Screen readers hear it through a polite or (errors) assertive live region; focus never
   * moves, so typing isn't interrupted. */
  const TOAST_MS = { success: 3000, info: 3000, error: 5500 };
  const TOAST_IC = { success: "check", info: "info", error: "alert" };
  let toastTimer = 0, toastLeft = 0, toastUntil = 0;
  const announce = (msg, type) => {
    const el = MBB.$(type === "error" ? "#toast-alert" : "#toast-polite");
    if (!el) return;
    el.textContent = "";
    setTimeout(() => { el.textContent = msg; }, 60); // a change, so it's read even when repeated
  };
  MBB.toast = (msg, { type = "info", action = null } = {}) => {
    const el = MBB.$("#toast");
    if (!TOAST_MS[type]) type = "info";
    el.className = `toast toast-${type}`;
    el.innerHTML = `${MBB.icon(TOAST_IC[type], "toast-ic")}<span class="toast-msg">${MBB.esc(msg)}</span>
      ${action ? `<button type="button" class="toast-act">${MBB.esc(action.label)}</button>` : ""}
      <button type="button" class="toast-x" aria-label="${MBB.esc(MBB.t("toast.dismiss"))}">${MBB.icon("close")}</button>`;
    if (action) el.querySelector(".toast-act").addEventListener("click", ev => { ev.stopPropagation(); MBB.toast.hide(); action.run(); });
    el.querySelector(".toast-x").addEventListener("click", MBB.toast.hide); // keyboard; taps are handled below
    el.hidden = false;
    void el.offsetWidth; // start the slide-in from above
    el.classList.add("show");
    announce(msg, type);
    if (type === "error") { try { navigator.vibrate?.(40); } catch { /* not supported */ } }
    toastLeft = action ? Math.max(TOAST_MS[type], 6000) : TOAST_MS[type];
    MBB.toast.resume();
  };
  MBB.toast.pause = () => { clearTimeout(toastTimer); toastLeft = Math.max(1200, toastUntil - Date.now()); };
  MBB.toast.resume = () => { clearTimeout(toastTimer); toastUntil = Date.now() + toastLeft; toastTimer = setTimeout(MBB.toast.hide, toastLeft); };
  MBB.toast.hide = () => {
    const el = MBB.$("#toast");
    clearTimeout(toastTimer);
    if (el.hidden) return;
    el.classList.remove("show");
    setTimeout(() => { if (!el.classList.contains("show")) el.hidden = true; }, 220);
  };
  // Copy results: "Copied" (success) or "Couldn't copy" (error).
  MBB.copied = (ok, msg) => MBB.toast(ok ? msg : MBB.t("common.copyFail"), { type: ok ? "success" : "error" });
  // Touch: stays while held; a tap or a swipe up dismisses it. Mouse: stays while hovered.
  {
    let y0 = null;
    const el = () => MBB.$("#toast");
    document.addEventListener("pointerdown", e => { if (e.target.closest?.("#toast") && !e.target.closest(".toast-act")) { y0 = e.clientY; MBB.toast.pause(); } });
    document.addEventListener("pointerup", e => {
      if (y0 == null) return;
      const moved = y0 - e.clientY; y0 = null;
      if (moved > 24 || (Math.abs(moved) < 8 && e.target.closest?.("#toast"))) MBB.toast.hide(); else MBB.toast.resume();
    });
    document.addEventListener("pointercancel", () => { if (y0 != null) { y0 = null; MBB.toast.resume(); } });
    document.addEventListener("pointerover", e => { if (e.pointerType === "mouse" && e.target.closest?.("#toast") && !el().hidden && !e.relatedTarget?.closest?.("#toast")) MBB.toast.pause(); });
    document.addEventListener("pointerout", e => { if (e.pointerType === "mouse" && e.target.closest?.("#toast") && !el().hidden && !e.relatedTarget?.closest?.("#toast")) MBB.toast.resume(); });
  }
  // Call from inside a click handler: writeText must start before any await.
  MBB.copy = text => {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.append(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      return ok;
    };
    try {
      return navigator.clipboard.writeText(text).then(() => true, fallback);
    } catch {
      return Promise.resolve(fallback());
    }
  };

  /* ---------- back gesture closes sheets and the full-screen card (#31) ----------
   * The installed app has no browser back button, and Android's back gesture would leave the
   * screen (or the app) with a sheet still open. Opening one adds a history entry at the same
   * address, so "back" closes it. Closing it another way removes that entry again. */
  let closeTop = null;
  MBB.overlay = {
    opened(close) {
      if (!closeTop && !history.state?.mbbOverlay) { try { history.pushState({ mbbOverlay: 1 }, ""); } catch { /* sandboxed preview */ } }
      closeTop = close;
    },
    closed() {
      if (!closeTop) return;
      closeTop = null;
      // Later, so a sheet that opens another (SOS → driver card) keeps the same entry.
      setTimeout(() => { if (!closeTop && history.state?.mbbOverlay) history.back(); }, 0);
    },
  };
  window.addEventListener("popstate", () => {
    const close = closeTop;
    closeTop = null;
    if (close) close();
    // An entry left behind when a sheet closed by following a link: skip it.
    else if (history.state?.mbbOverlay) history.back();
  });

  /* ---------- full-screen "show this" card ---------- */
  let lastFocus = null, wakeLock = null;
  MBB.present = ({ kicker = "", big, sub = "" }) => {
    const el = MBB.$("#present");
    el.innerHTML = `<div class="present-in">
      ${kicker ? `<p class="present-kicker">${MBB.esc(kicker)}</p>` : ""}
      <p class="present-big">${MBB.esc(big)}</p>
      ${sub ? `<p class="present-sub">${MBB.esc(sub)}</p>` : ""}
      <button type="button" class="btn btn-ghost present-close" id="present-close">${MBB.esc(MBB.t("common.close"))}</button>
    </div>`;
    lastFocus = document.activeElement;
    el.hidden = false;
    MBB.$("#present-close").focus();
    MBB.overlay.opened(MBB.closePresent);
    try { navigator.wakeLock?.request("screen").then(l => (wakeLock = l), () => {}); } catch { /* optional */ }
  };
  MBB.closePresent = () => {
    const el = MBB.$("#present");
    if (el.hidden) return;
    el.hidden = true;
    MBB.overlay.closed();
    try { wakeLock?.release(); } catch { /* ignore */ }
    wakeLock = null;
    lastFocus?.focus?.();
  };

  /* ---------- speech ---------- */
  let voices = [];
  const loadVoices = () => { try { voices = window.speechSynthesis?.getVoices() || []; } catch { voices = []; } };
  loadVoices();
  try { window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices); } catch { /* ignore */ }
  // Returns false when no suitable voice exists, so the caller can offer "Show" instead.
  MBB.speak = text => {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
    if (!voices.length) loadVoices();
    let voice = null;
    for (const l of MBB.C.speechLang) {
      const base = l.slice(0, 2).toLowerCase();
      voice = voices.find(v => v.lang && v.lang.replace("_", "-").toLowerCase() === l.toLowerCase())
        || voices.find(v => v.lang && v.lang.toLowerCase().startsWith(base));
      if (voice) break;
    }
    if (!voice) return false;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice; u.lang = voice.lang; u.rate = 0.9;
      synth.speak(u);
      return true;
    } catch { return false; }
  };

  /* ---------- icons (24px line icons, currentColor) ---------- */
  const P = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    guide: '<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>',
    plan: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    tools: '<path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M20 18h0"/><circle cx="16" cy="6" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
    ask: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    passport: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 16.5h6"/>',
    plane: '<path d="M21 15.5l-8-4.5V5a1.5 1.5 0 0 0-3 0v6l-8 4.5v2l8-2.5v4l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-4l8 2.5z"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>',
    train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10.5h14"/><circle cx="9" cy="13.5" r="1"/><circle cx="15" cy="13.5" r="1"/><path d="M8 21l2-4M16 21l-2-4"/>',
    signal: '<path d="M4 20v-3M9 20v-7M14 20V9M19 20V4"/>',
    bowl: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M9 3.5c0 2 1.5 2 1.5 4M13.5 3.5c0 2 1.5 2 1.5 4"/>',
    hands: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7S5 18 4 15l-1.2-3a1.5 1.5 0 0 1 2.7-1.2L8 14"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    cloud: '<path d="M7 17h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 8.5 4.3 4.3 0 0 0 7 17z"/><path d="M9 21l1-2M13 21l1-2"/>',
    cross: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
    bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2c2.1.7 3.5 2.8 3.5 5.8"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13"/><path d="M12 8c-1.5-3.5-6-4-6-1.5S9 8 12 8zM12 8c1.5-3.5 6-4 6-1.5S15 8 12 8z"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    news: '<path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5M7 14l1.5 5h2.5L10 15"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    tree: '<path d="M12 3l6 8h-3l4 6H5l4-6H6z"/><path d="M12 17v4"/>',
    mountain: '<path d="M3 19l6-10 4 6 2-3 6 7z"/><path d="M7.5 11.5l1.5 1.5 1.5-1.5"/>',
    wave: '<path d="M3 15c2 0 2-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2"/><path d="M3 19c2 0 2-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2"/><circle cx="16" cy="7" r="3"/>',
    island: '<path d="M3 19c3-3 15-3 18 0"/><path d="M12 17V8"/><path d="M12 8c-2-3-6-3-8-1 3-1 6 0 8 1zM12 8c2-3 6-3 8-1-3-1-6 0-8 1z"/>',
    building: '<rect x="4" y="3" width="10" height="18"/><path d="M14 9h6v12h-6"/><path d="M7 7h1M10 7h1M7 11h1M10 11h1M7 15h1M10 15h1"/>',
    bed: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
    car: '<path d="M3 17v-4l2.2-5.2A2 2 0 0 1 7 6.5h10a2 2 0 0 1 1.8 1.3L21 13v4z"/><path d="M3 13h18"/><circle cx="7.5" cy="15" r="1"/><circle cx="16.5" cy="15" r="1"/><path d="M5 17v2.5M19 17v2.5"/>',
    landmark: '<path d="M3 21h18M4 10h16M12 3l9 5H3z"/><path d="M6 10v9M10 10v9M14 10v9M18 10v9"/>',
    fish: '<path d="M3 12c3-4 8-5 12-3l4-3v12l-4-3c-4 2-9 1-12-3z"/><circle cx="8" cy="11" r=".8"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    route: '<path d="M12 2l10 10-10 10L2 12z"/><path d="M9 14v-2.5a1.5 1.5 0 0 1 1.5-1.5H15M13 8l2 2-2 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  MBB.icon = (name, cls = "") =>
    `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
})();
