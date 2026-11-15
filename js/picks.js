/* Miiuz Beyond Borders — Our Pick! (#50): food places the Miiuz team visited and recommends, listed
 * with the owner's written consent. Listings come from Supabase (our_picks) through /api/picks and
 * are kept on the phone (mbb.picks), so the last ones seen still show offline. They appear in
 * Explore, on city pages, in search, and each has a place page (#place-pick-<slug>).
 * Photos are the owner's own, used with permission and credited (through /api/photo).
 * Halal: only JAKIM or a state Islamic authority can certify, so an uncertified place is never
 * called halal, and an expired certificate turns into "ask the shop". */
(function () {
  const MBB = window.MBB;
  const { esc, t, L, icon } = MBB;
  const KEY = "picks";
  // A name, like "Cuti-cuti Malaysia!": the same in every language, and kept left-to-right in RTL ones.
  const BRAND = '<bdi dir="ltr">Our Pick!</bdi>';
  const DAY = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
  const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  const PAY = { cash: "pick.pay.cash", duitnow: "DuitNow QR", card: "pick.pay.card", alipay: "Alipay+", wechat: "WeChat Pay" };

  let items = null;    // null: never loaded on this phone
  let failed = false;  // the last load didn't work (offline)
  let pending = null;

  /* ---------- loading ---------- */
  function use(list) {
    items = list;
    MBB.C.picks = items; // so languages without a hand translation get them translated (js/i18n-entries.js)
    MBB.translator?.more();
  }
  function load() {
    if (pending) return pending;
    const saved = MBB.store.get(KEY, null);
    if (items === null && Array.isArray(saved?.items)) use(saved.items);
    pending = (async () => {
      if (window.claude) return;
      try {
        const r = await MBB.api("api/picks");
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (!Array.isArray(j.picks)) throw new Error("bad");
        MBB.store.set(KEY, { at: Date.now(), items: j.picks });
        failed = false;
        use(j.picks);
      } catch { failed = true; }
      finally { pending = null; MBB.emit("picks"); }
    })();
    return pending;
  }
  const list = () => items || [];
  const get = slug => list().find(p => p.slug === slug) || null;
  const loading = () => !!pending;
  const inCity = city => list().filter(p => !city || p.city === city);

  /* ---------- text ---------- */
  const nameOf = p => p.names?.[MBB.state.lang] || p.name;
  const dishName = d => L(d);
  const payText = p => p.pay.map(k => (PAY[k].startsWith("pick.") ? t(PAY[k]) : PAY[k])).join(" · ");

  // Malaysia time now: weekday (0 = Sunday), minutes since midnight and the date.
  function now() {
    try {
      const x = new Intl.DateTimeFormat("en-US", { timeZone: MBB.C.timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date()).reduce((o, p) => ((o[p.type] = p.value), o), {});
      return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(x.weekday), min: Number(x.hour) * 60 + Number(x.minute), date: `${x.year}-${x.month}-${x.day}` };
    } catch {
      const d = new Date(Date.now() + 8 * 3600e3);
      return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes(), date: d.toISOString().slice(0, 10) };
    }
  }

  // short: under a "Halal status" label (place page), so "ask the shop" doesn't repeat it.
  function halal(p, short = false) {
    if (p.halal === "certified" && p.halalExpires && p.halalExpires >= now().date) return { cls: "ok", text: t("pick.halal.certified", { b: p.halalBody }) };
    if (p.halal === "no_pork") return { cls: "warn", text: t("pick.halal.noPork") };
    if (p.halal === "not_halal") return { cls: "", text: t("pick.halal.not") };
    return { cls: "", text: t(short ? "pick.halal.askShort" : "pick.halal.ask") }; // certificate expired: don't say halal
  }

  /* ---------- opening hours ("Mo-Sa 07:00-15:00; Su off", OpenStreetMap's short form) ---------- */
  // → seven lists of [open, close] minutes, Sunday first; close ≤ open means after midnight. null if unreadable.
  function week(s) {
    if (!s) return null;
    if (s.trim() === "24/7") return WEEK.map(() => [[0, 1440]]);
    const out = Array.from({ length: 7 }, () => []);
    for (const rule of s.split(";").map(x => x.trim()).filter(Boolean)) {
      const m = /^([A-Za-z,-]+) (.+)$/.exec(rule);
      if (!m) return null;
      const days = [];
      for (const part of m[1].split(",")) {
        const [a, b = a] = part.split("-");
        if (!(a in DAY) || !(b in DAY)) return null;
        for (let i = WEEK.indexOf(DAY[a]), n = 0; n < 7; n++, i = (i + 1) % 7) { days.push(WEEK[i]); if (WEEK[i] === DAY[b]) break; }
      }
      const spans = [];
      if (m[2] !== "off") {
        for (const sp of m[2].split(",")) {
          const x = /^(\d\d):(\d\d)-(\d\d):(\d\d)$/.exec(sp);
          if (!x) return null;
          spans.push([+x[1] * 60 + +x[2], +x[3] * 60 + +x[4]]);
        }
      }
      days.forEach(d => { out[d] = spans; }); // a later rule wins for the days it names
    }
    return out;
  }
  const weekday = d => { try { return new Intl.DateTimeFormat(MBB.locale(), { weekday: "short", timeZone: "UTC" }).format(Date.UTC(2026, 1, 1 + d)); } catch { return Object.keys(DAY)[d]; } };
  const span = ([a, b]) => (a === 0 && b === 1440 ? t("pick.allDay") : `${MBB.clock(a)}–${MBB.clock(b % 1440)}`);

  // Open now? { open, text }
  function status(p) {
    const w = week(p.hours);
    if (!w) return null;
    if (p.hours.trim() === "24/7") return { open: true, text: t("pick.always") };
    const { day, min } = now();
    const prev = (day + 6) % 7;
    for (const [a, b] of w[prev]) if (b <= a && min < b) return { open: true, text: t("pick.openUntil", { t: MBB.clock(b) }) };
    for (const [a, b] of w[day]) if (b > a ? a <= min && min < b : min >= a) return { open: true, text: t("pick.openUntil", { t: MBB.clock(b % 1440) }) };
    for (let k = 0; k < 7; k++) {
      const d = (day + k) % 7;
      const next = w[d].filter(([a]) => k > 0 || a > min).sort((x, y) => x[0] - y[0])[0];
      if (!next) continue;
      const at = MBB.clock(next[0]);
      return { open: false, text: k === 0 ? t("pick.opensAt", { t: at }) : k === 1 ? t("pick.opensTomorrow", { t: at }) : t("pick.opensOn", { d: weekday(d), t: at }) };
    }
    return { open: false, text: t("pick.closedNow") };
  }

  // The week, with days that have the same hours grouped: [["Mon–Sat", "7:00–15:00"], ["Sun", "Closed"]].
  function hoursRows(p) {
    const w = week(p.hours);
    if (!w) return p.hours ? [["", p.hours]] : [];
    const rows = [], today = now().day;
    for (const d of WEEK) {
      const val = w[d].length ? w[d].map(span).join(", ") : t("pick.closedDay");
      const last = rows[rows.length - 1];
      if (last && last.val === val) last.days.push(d); else rows.push({ days: [d], val });
    }
    return rows.map(({ days, val }) => [days.length === 1 ? weekday(days[0]) : `${weekday(days[0])}–${weekday(days[days.length - 1])}`, val, days.includes(today)]);
  }

  /* ---------- photos ---------- */
  const photo = (p, file) => (file ? { file, src: `/api/photo?pick=${encodeURIComponent(file)}`, srcL: `/api/photo?pick=${encodeURIComponent(file)}`, by: p.credit, lic: t("pick.permission"), page: `#place-pick-${p.slug}` } : null);
  const cover = p => photo(p, p.photos[0]);

  /* ---------- cards and sections ---------- */
  function cardHtml(p) {
    const h = halal(p), s = status(p), top = p.dishes[0];
    return `<a class="pick-card" href="#place-pick-${esc(p.slug)}">
      ${MBB.media.html(cover(p), { alt: "", ic: "bowl" })}
      ${p.sponsored ? `<span class="pill warn pick-sp">${esc(t("pick.sponsored"))}</span>` : ""}
      <span>
        <b>${esc(nameOf(p))}</b>
        <small>${esc([p.area || L(MBB.C.cities[p.city]), top ? dishName(top) : ""].filter(Boolean).join(" · "))}</small>
        <span class="pick-tags"><span class="pill halal ${h.cls}">${esc(h.text)}</span>${p.price ? `<span class="pill">${MBB.priceHtml(p.price)}</span>` : ""}</span>
        ${s ? `<small class="pick-open${s.open ? " open" : ""}">${icon("clock")}${esc(s.text)}</small>` : ""}
      </span>
    </a>`;
  }

  // Explore (all cities) or a city page. Empty when there's nothing to show.
  function sectionHtml(city = null) {
    const ps = inCity(city);
    if (!ps.length) {
      // Never loaded on this phone and no connection: say so, once, in Explore.
      return !city && items === null && failed
        ? `<section class="picks"><div class="section-title"><h2>${BRAND}</h2></div><p class="card pick-off">${icon("signal")}<span>${esc(t("pick.offline"))}</span></p></section>`
        : "";
    }
    return `<section class="picks">
        <div class="section-title"><h2>${BRAND}</h2></div>
        <p class="hint">${esc(t(city ? "pick.leadCity" : "pick.lead", { c: city ? L(MBB.C.cities[city]) : "" }))}</p>
        <div class="strip">${ps.map(cardHtml).join("")}</div>
      </section>`;
  }

  // A place page model (js/place.js) for #place-pick-<slug>.
  function place(slug) {
    const p = get(slug);
    if (!p) return null;
    const h = halal(p, true), s = status(p);
    const facts = [];
    if (s) facts.push(["clock", t("place.hours"), s.text]);
    if (p.price) facts.push(["coins", t("pick.price"), p.price]);
    facts.push(["check", t("pick.halal"), h.text]);
    if (p.pay.length) facts.push(["coins", t("pick.payHow"), payText(p)]);
    return {
      kind: "pick", id: p.slug, name: nameOf(p), local: p.name, lat: p.lat, lng: p.lng, ic: "bowl", type: t("ptype.food"),
      area: p.area || L(MBB.C.cities[p.city]), addr: p.address, city: p.city, photoObj: cover(p), lead: L(p.blurb), facts, zoom: 17,
      phone: p.phone || "", pick: p,
    };
  }

  // The parts of a pick's page that other places don't have: what to order, the week's hours, more photos.
  function pageHtml(p) {
    const rows = hoursRows(p);
    const more = p.photos.slice(1).map(f => photo(p, f));
    const checked = p.checked ? (() => { try { return new Intl.DateTimeFormat(MBB.locale(), { year: "numeric", month: "long", timeZone: "UTC" }).format(Date.parse(p.checked)); } catch { return p.checked; } })() : "";
    return `
      ${p.dishes.length ? `<section class="card pick-order">
        <h2>${icon("bowl")}${esc(t("pick.order"))}</h2>
        <ul>${p.dishes.map(d => `<li><span><b>${esc(dishName(d))}</b>${d.ms && d.ms !== dishName(d) ? `<small lang="ms">${esc(d.ms)}</small>` : ""}</span>${d.price ? `<span class="pick-price">${MBB.priceHtml(d.price)}</span>` : ""}</li>`).join("")}</ul>
      </section>` : ""}
      ${rows.length ? `<section class="card pick-hours">
        <h2>${icon("clock")}${esc(t("place.hours"))}</h2>
        <dl>${rows.map(([d, v, today]) => `<div${today ? ' class="today"' : ""}><dt>${esc(d)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        ${L(p.hoursNote) ? `<p class="hint">${esc(L(p.hoursNote))}</p>` : ""}
      </section>` : ""}
      ${more.length ? `<div class="strip pick-photos">${more.map(ph => MBB.media.html(ph, { alt: nameOf(p), ic: "bowl" })).join("")}</div>` : ""}
      <p class="hint pick-note">${p.sponsored ? `<b>${esc(t("pick.sponsored"))}:</b> ${esc(t("pick.sponsoredNote"))} ` : ""}${esc(checked ? t("pick.checked", { d: checked }) : t("pick.checkFirst"))}</p>`;
  }

  // Search (js/search.js): name, area and dishes.
  function searchItems() {
    return list().map(p => ({
      item: { kind: "pick", href: `#place-pick-${p.slug}`, title: nameOf(p), sub: ["Our Pick!", p.area || L(MBB.C.cities[p.city])].filter(Boolean).join(" · "), ic: "bowl", photo: cover(p), boost: 5 },
      keys: [p.name, ...Object.values(p.names || {}), ...p.dishes.flatMap(d => [d.ms, ...Object.values(d).filter(x => typeof x === "string" && !/^RM\d/.test(x))])],
      text: [L(p.blurb), p.blurb.en, p.area],
    }));
  }

  MBB.picks = {
    BRAND,
    init() {
      load();
      // Back online, or the app comes back to the front: fetch the latest picks.
      window.addEventListener("online", load);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - (MBB.store.get(KEY, null)?.at || 0) > 10 * 60e3) load();
      });
    },
    load, list, get, loading, sectionHtml, place, pageHtml, searchItems, halal, status, week,
  };
})();
