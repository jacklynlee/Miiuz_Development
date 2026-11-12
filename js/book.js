/* Miiuz Beyond Borders — Stays (#4) and Car tours (#10), both part of the Explore tab.
 * Travellers pick a place, dates and their group, then open the partners' own search with all of it
 * filled in: Agoda and Booking.com for stays, Klook and KKday for a private car with a driver. They book
 * and pay there. Miiuz shows no listings or prices of its own until the partners approve it.
 *  - Partner addresses and place names were checked on their sites on 2026-11-13 (book in
 *    js/data/malaysia.explore.js). Agoda, Booking.com and KKday open in the app's language for EN,
 *    简体中文, 繁體中文, 한국어 and 日本語; for other languages the partner picks.
 *  - Affiliate links (later): once a partner approves Miiuz, set MIIUZ_LINK_<PARTNER> in Vercel
 *    (api/config.mjs). Links to that partner then go through the template with a tag: a member's
 *    pseudonymous booking tag (profiles.booking_tag, never their email), so the booking can earn
 *    points (#8), or "guest". The page then says Miiuz may earn a commission. No code change needed.
 *  - Choices are kept on this phone (mbb.book.stay, mbb.book.tour). After a traveller opens a partner,
 *    the page offers to add the booking to My trip (#5). Car tours also writes a message for the
 *    driver, in English, with the day plan if they want it. */
(function () {
  const MBB = window.MBB;
  const { $, esc, t, L, icon } = MBB;

  const NAMES = { agoda: "Agoda", booking: "Booking.com", klook: "Klook", kkday: "KKday" };
  // The partners' own language codes (checked 2026-11-13). Other languages: the partner decides.
  const LANG = {
    agoda: { en: "en-gb", zh: "zh-cn", "zh-Hant": "zh-tw", ko: "ko-kr", ja: "ja-jp" },
    booking: { en: "en-gb", zh: "zh-cn", "zh-Hant": "zh-tw", ko: "ko", ja: "ja" },
    kkday: { en: "en", zh: "zh-cn", "zh-Hant": "zh-tw", ko: "ko", ja: "ja" },
  };
  // Languages a driver may speak: shown in its own language, and in English in the message.
  const SPEAKS = { en: ["English", "English"], zh: ["中文（普通话）", "Mandarin Chinese"], yue: ["粵語", "Cantonese"],
    ko: ["한국어", "Korean"], ja: ["日本語", "Japanese"], ms: ["Bahasa Melayu", "Malay"] };
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const enc = encodeURIComponent;
  const isolate = s => `⁨${s}⁩`; // brand names keep their order in right-to-left languages

  /* ---------- dates and numbers ---------- */
  const today = () => MBB.trip.today();
  function addDays(d, n) {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
  }
  const nightsBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  function clamp(v, lo, hi, dflt) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && v !== "" && v != null ? Math.min(hi, Math.max(lo, n)) : dflt;
  }
  function enDate(d) {
    try {
      const [y, m, dd] = d.split("-").map(Number);
      return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, dd));
    } catch { return d; }
  }

  /* ---------- places ---------- */
  const book = () => MBB.C.book || {};
  const dest = id => MBB.C.destinations.find(d => d.id === id);
  const placeName = id => (MBB.C.cities[id] ? L(MBB.C.cities[id]) : L(dest(id)?.name) || id);
  const placeEn = id => (MBB.C.cities[id] ? MBB.C.cities[id].en : dest(id)?.name.en || id);
  // Cities first (in the app's order), then destinations by name in the traveller's language.
  function selectHtml(id, value, tours) {
    const C = MBB.C, B = book(), ok = k => B[k] && (!tours || B[k].tours);
    let coll;
    try { coll = new Intl.Collator(MBB.locale()); } catch { coll = new Intl.Collator("en"); }
    const opt = ([k, name]) => `<option value="${k}"${k === value ? " selected" : ""}>${esc(name)}</option>`;
    const cities = Object.keys(C.cities).filter(ok).map(k => [k, L(C.cities[k])]);
    const dests = C.destinations.filter(d => ok(d.id)).map(d => [d.id, L(d.name)]).sort((a, b) => coll.compare(a[1], b[1]));
    return `<select id="${id}" name="where">
      <optgroup label="${esc(t("book.cities"))}">${cities.map(opt).join("")}</optgroup>
      ${dests.length ? `<optgroup label="${esc(t("explore.dest"))}">${dests.map(opt).join("")}</optgroup>` : ""}
    </select>`;
  }

  /* ---------- what the traveller picked (kept on this phone) ---------- */
  function fixStay(s) {
    const now = today(), last = addDays(now, 364);
    if (!DATE.test(s.in) || s.in < now) s.in = now;
    if (s.in > last) s.in = last;
    if (!DATE.test(s.out) || s.out <= s.in) s.out = addDays(s.in, 1);
    if (nightsBetween(s.in, s.out) > 30) s.out = addDays(s.in, 30);
    return s;
  }
  function fixTour(x) {
    const now = today();
    if (!DATE.test(x.date) || x.date < now) x.date = now;
    if (x.date > addDays(now, 364)) x.date = addDays(now, 364);
    return x;
  }
  function loadStay() {
    const v = MBB.store.get("book.stay", null) || {}, B = book();
    return fixStay({
      where: B[v.where] ? v.where : B[MBB.state.city] ? MBB.state.city : "kl",
      in: v.in, out: v.out, adults: clamp(v.adults, 1, 16, 2), rooms: clamp(v.rooms, 1, 8, 1), near: null,
    });
  }
  function loadTour() {
    const v = MBB.store.get("book.tour", null) || {}, B = book();
    return fixTour({
      where: B[v.where]?.tours ? v.where : B[MBB.state.city]?.tours ? MBB.state.city : "kl",
      date: v.date, len: v.len === "half" ? "half" : "full", people: clamp(v.people, 1, 15, 2),
      lang: SPEAKS[v.lang] ? v.lang : "", withPlan: v.withPlan !== false,
    });
  }
  let S = null, T = null;   // set in init(), once My trip can say what day it is in Malaysia
  let opened = { stay: null, tour: null }; // the partner opened last, for "Booked one?"
  const saveStay = () => MBB.store.set("book.stay", { where: S.where, in: S.in, out: S.out, adults: S.adults, rooms: S.rooms });
  const saveTour = () => MBB.store.set("book.tour", { where: T.where, date: T.date, len: T.len, people: T.people, lang: T.lang, withPlan: T.withPlan });

  /* ---------- partner links ---------- */
  let links = {}, tag = "";
  // A template from Vercel: https://… or {url}…, with {url} or {url_enc}, and optionally {tag}.
  const goodTemplate = v => typeof v === "string" && /^(https:\/\/|\{url\})/.test(v) && /\{url(_enc)?\}/.test(v) && !/[<>"\s]/.test(v);
  function out(p, url) {
    const tpl = links[p];
    if (!tpl) return url;
    return tpl.split("{url_enc}").join(enc(url)).split("{url}").join(url).split("{tag}").join(enc(tag || "guest"));
  }

  function stayLinks(s) {
    const B = book()[s.where] || {}, lang = MBB.state.lang, list = [];
    if (B.agoda) {
      const l = LANG.agoda[lang];
      list.push(["agoda", `https://www.agoda.com/${l ? `${l}/` : ""}search?city=${B.agoda}&checkIn=${s.in}&checkOut=${s.out}&rooms=${s.rooms}&adults=${s.adults}&children=0`]);
    }
    const q = new URLSearchParams({ ss: s.near ? s.near.name : B.booking, checkin: s.in, checkout: s.out, group_adults: s.adults, no_rooms: s.rooms, group_children: 0 });
    if (s.near) { q.set("latitude", s.near.lat.toFixed(5)); q.set("longitude", s.near.lng.toFixed(5)); q.set("dest_type", "latlong"); }
    if (LANG.booking[lang]) q.set("lang", LANG.booking[lang]);
    list.push(["booking", `https://www.booking.com/searchresults.html?${q}`]);
    // Near a particular place, Booking.com searches around it, so it comes first.
    return s.near ? list.reverse() : list;
  }
  function tourLinks(x) {
    const p = book()[x.where]?.tours || placeEn(x.where), l = LANG.kkday[MBB.state.lang] || "en";
    return [
      ["klook", `https://www.klook.com/search/result/?query=${enc(`car charter ${p}`)}`],
      ["kkday", `https://www.kkday.com/${l}/product/productlist?keyword=${enc(`charter ${p}`)}`],
    ];
  }

  function goHtml(list) {
    const off = navigator.onLine === false;
    return `<div class="actions">${list.map(([p, url]) => `<a class="btn btn-main" data-partner="${p}" href="${esc(out(p, url))}" target="_blank" rel="noopener">${icon("external")}${esc(t("book.searchOn", { p: isolate(NAMES[p]) }))}</a>`).join("")}</div>
      ${off ? `<p class="hint warn">${esc(t("book.offline"))}</p>` : ""}
      <p class="hint">${esc(t("book.note"))}</p>
      ${list.some(([p]) => links[p]) ? `<p class="hint">${esc(t("book.commission"))}</p>` : ""}`;
  }
  function afterHtml(kind) {
    const o = opened[kind];
    if (!o) return "";
    return `<div><b>${esc(t("book.after"))}</b><small>${esc(t(kind === "stay" ? "book.afterStay" : "book.afterTour"))}</small></div>
      <button type="button" class="btn btn-main btn-sm" data-add="${kind}">${icon(kind === "stay" ? "bed" : "car")}${esc(t("book.addTrip"))}</button>`;
  }
  const tips = keys => `<section class="card tool"><h2>${icon("check")}${esc(t("book.tips"))}</h2>
    <ul class="book-tips">${keys.map(k => `<li>${MBB.priceHtml(t(k))}</li>`).join("")}</ul></section>`;
  const back = () => `<a class="back" href="#explore" data-back>${icon("back")}${esc(t("nav.explore"))}</a>`;
  const visible = id => { const v = $(`#view-${id}`); return v && !v.hidden; };

  /* ---------- Stays (#stays) ---------- */
  function nightsText(s) {
    const n = nightsBetween(s.in, s.out);
    return MBB.state.lang === "en" && n === 1 ? "1 night" : t("trip.nights", { n });
  }
  function nearHtml() {
    return S.near ? `<p class="book-near">${icon("pin")}<span>${esc(t("stays.near", { p: S.near.label }))}</span>
      <button type="button" class="btn btn-ghost btn-sm" id="bs-near-off">${esc(t("stays.nearOff"))}</button></p>` : "";
  }
  function renderStays() {
    const v = $("#view-stays");
    if (!v) return;
    fixStay(S);
    v.innerHTML = `${back()}
      <div class="view-head"><h1>${esc(t("stays.title"))}</h1><p>${esc(t("stays.lead"))}</p></div>
      <form class="panel book-form" id="bs-form" autocomplete="off" novalidate>
        <label for="bs-where">${esc(t("book.where"))}${selectHtml("bs-where", S.where, false)}</label>
        <div id="bs-near">${nearHtml()}</div>
        <div class="row">
          <label for="bs-in">${esc(t("trip.f.checkIn"))}<input type="date" id="bs-in" name="in" value="${S.in}" min="${today()}" max="${addDays(today(), 364)}" required></label>
          <label for="bs-out">${esc(t("trip.f.checkOut"))}<input type="date" id="bs-out" name="out" value="${S.out}" min="${addDays(S.in, 1)}" max="${addDays(S.in, 30)}" required></label>
        </div>
        <div class="row">
          <label for="bs-adults">${esc(t("stays.adults"))}<input type="number" inputmode="numeric" id="bs-adults" name="adults" min="1" max="16" step="1" value="${S.adults}"></label>
          <label for="bs-rooms">${esc(t("stays.rooms"))}<input type="number" inputmode="numeric" id="bs-rooms" name="rooms" min="1" max="8" step="1" value="${S.rooms}"></label>
        </div>
        <p class="hint" id="bs-nights">${esc(nightsText(S))}</p>
      </form>
      <section class="book-go" id="bs-go">${goHtml(stayLinks(S))}</section>
      <section class="card book-after" id="bs-after" aria-live="polite"${opened.stay ? "" : " hidden"}>${afterHtml("stay")}</section>
      ${tips(["stays.tip1", "stays.tip2", "stays.tip3"])}`;
  }
  // Something changed in the form: keep it valid, save it, and update the links without redrawing it.
  function updateStay(e) {
    // A date being typed is empty until it's complete: wait for it.
    if (e?.type === "input" && e.target.type === "date" && !e.target.value) return;
    const f = $("#bs-form");
    if (!f) return;
    const el = f.elements;
    if (e?.target?.name === "where") S.near = null;
    const prevIn = S.in;
    S.where = el.where.value;
    S.in = el.in.value;
    // A new check-in date moves check-out with it, keeping the number of nights.
    if (e?.target?.name === "in" && DATE.test(S.in) && DATE.test(prevIn)) S.out = addDays(S.in, Math.max(1, nightsBetween(prevIn, S.out)));
    else S.out = el.out.value;
    S.adults = clamp(el.adults.value, 1, 16, S.adults);
    S.rooms = clamp(el.rooms.value, 1, 8, S.rooms);
    fixStay(S);
    // Leave a number box alone while it's being typed in (it may be empty for a moment).
    if (e?.type === "change" || !["adults", "rooms"].includes(e?.target?.name)) { el.adults.value = S.adults; el.rooms.value = S.rooms; }
    if (el.in.value !== S.in) el.in.value = S.in;
    if (el.out.value !== S.out) el.out.value = S.out;
    el.out.min = addDays(S.in, 1); el.out.max = addDays(S.in, 30);
    saveStay();
    $("#bs-near").innerHTML = nearHtml();
    $("#bs-nights").textContent = nightsText(S);
    $("#bs-go").innerHTML = goHtml(stayLinks(S));
  }

  /* ---------- Car tours (#tours) ---------- */
  // Today's plan from the planner, if it's for this place.
  function planFor(where) {
    const b = MBB.planner?.brief?.();
    return b && b.city === where && b.stops.length ? b : null;
  }
  // Pickup: where the traveller stays that day, unless it's far from the tour (a KL hotel is no
  // use for a Sabah tour). A stay without a map point, or today's typed address, can't be checked.
  // { pickup, lat?, lng? }, as a My trip tour has it.
  const place = id => MBB.C.cities[id] || dest(id);
  function pickupFor(x) {
    const s = MBB.trip.stayOn(x.date), c = place(x.where);
    if (s) return s.lat != null && c?.lat != null && MBB.maps.km(s, c) > 60 ? { pickup: "" } : MBB.trip.pickupFrom(s);
    return { pickup: x.date === today() ? MBB.trip.whereText() : "" };
  }
  const pickup = x => pickupFor(x).pickup.replace(/\s*\n\s*/g, ", ");
  // In English, which most drivers in Malaysia read; the traveller sees exactly what they'll send.
  function message() {
    const x = T, plan = x.withPlan ? planFor(x.where) : null, from = pickup(x);
    const lines = ["Hello! I'd like to book a private car with a driver.",
      `Where: ${placeEn(x.where)}`,
      `Date: ${enDate(x.date)}`,
      `How long: ${x.len === "half" ? "half day (about 4 hours)" : "full day (8–10 hours)"}`,
      `People: ${x.people}`];
    if (x.lang) lines.push(`Driver who speaks: ${SPEAKS[x.lang][1]}, if possible`);
    if (from || plan) lines.push(`Pickup: ${[plan?.start, from].filter(Boolean).join(", ")}`);
    if (plan) lines.push("", `My plan for the day (${plan.start}–${plan.end}):`, ...plan.stops);
    lines.push("", "Please confirm the price and what's included (fuel, tolls, parking, overtime). Thank you!");
    return lines.join("\n");
  }
  function chip(value, title, sub) {
    return `<div class="chip"><input type="radio" name="len" id="bt-len-${value}" value="${value}"${T.len === value ? " checked" : ""}><label for="bt-len-${value}">${esc(t(title))}<i>${esc(t(sub))}</i></label></div>`;
  }
  function renderTours() {
    const v = $("#view-tours");
    if (!v) return;
    fixTour(T);
    const plan = planFor(T.where);
    v.innerHTML = `${back()}
      <div class="view-head"><h1>${esc(t("tours.title"))}</h1><p>${esc(t("tours.lead"))}</p></div>
      <form class="panel book-form" id="bt-form" autocomplete="off" novalidate>
        <label for="bt-where">${esc(t("book.where"))}${selectHtml("bt-where", T.where, true)}</label>
        <div class="row">
          <label for="bt-date">${esc(t("trip.f.date"))}<input type="date" id="bt-date" name="date" value="${T.date}" min="${today()}" max="${addDays(today(), 364)}" required></label>
          <label for="bt-people">${esc(t("tours.people"))}<input type="number" inputmode="numeric" id="bt-people" name="people" min="1" max="15" step="1" value="${T.people}"></label>
        </div>
        <fieldset><legend>${esc(t("tours.length"))}</legend>
          <div class="chips">${chip("half", "tours.half", "tours.halfD")}${chip("full", "tours.full", "tours.fullD")}</div>
        </fieldset>
        <label for="bt-lang">${esc(t("tours.lang"))}<select id="bt-lang" name="lang">
          <option value="">${esc(t("tours.langAny"))}</option>
          ${Object.entries(SPEAKS).map(([k, [own]]) => `<option value="${k}"${T.lang === k ? " selected" : ""}>${esc(own)}</option>`).join("")}
        </select></label>
        <label class="toggle" for="bt-plan" id="bt-plan-row"${plan ? "" : " hidden"}><input type="checkbox" id="bt-plan" name="withPlan"${T.withPlan ? " checked" : ""}> <span>${esc(t("tours.withPlan"))}</span></label>
      </form>
      <section class="book-go" id="bt-go">${goHtml(tourLinks(T))}</section>
      <section class="card book-after" id="bt-after" aria-live="polite"${opened.tour ? "" : " hidden"}>${afterHtml("tour")}</section>
      <section class="card tool">
        <h2>${icon("copy")}${esc(t("tours.msgTitle"))}</h2>
        <p>${esc(t("tours.msgHint"))}</p>
        <pre class="book-msg" id="bt-msg" dir="ltr" lang="en">${esc(message())}</pre>
        <div class="actions"><button type="button" class="btn btn-ghost btn-sm" id="bt-copy">${icon("copy")}${esc(t("tours.copy"))}</button></div>
      </section>
      ${tips(["tours.tip1", "tours.tip2", "tours.tip3", "tours.tip4"])}`;
  }
  function updateTour(e) {
    // A date being typed is empty until it's complete: wait for it.
    if (e?.type === "input" && e.target.type === "date" && !e.target.value) return;
    const f = $("#bt-form");
    if (!f) return;
    const el = f.elements;
    T.where = el.where.value;
    T.date = el.date.value;
    T.people = clamp(el.people.value, 1, 15, T.people);
    T.len = el.len.value === "half" ? "half" : "full";
    T.lang = SPEAKS[el.lang.value] ? el.lang.value : "";
    T.withPlan = el.withPlan.checked;
    fixTour(T);
    if (e?.type === "change" || e?.target?.name !== "people") el.people.value = T.people;
    if (el.date.value !== T.date) el.date.value = T.date;
    saveTour();
    $("#bt-plan-row").hidden = !planFor(T.where);
    $("#bt-go").innerHTML = goHtml(tourLinks(T));
    $("#bt-msg").textContent = message();
  }

  /* ---------- both pages ---------- */
  function refreshGo() {
    if (visible("stays") && S) $("#bs-go").innerHTML = goHtml(stayLinks(S));
    if (visible("tours") && T) $("#bt-go").innerHTML = goHtml(tourLinks(T));
  }
  function bind() {
    for (const [id, update] of [["stays", updateStay], ["tours", updateTour]]) {
      const v = $(`#view-${id}`);
      v.addEventListener("input", update);
      v.addEventListener("change", update);
      v.addEventListener("submit", e => e.preventDefault());
      v.addEventListener("click", e => {
        const a = e.target.closest("a[data-partner]");
        if (a) {
          if (navigator.onLine === false) { e.preventDefault(); MBB.toast(t("book.offline"), { type: "error" }); return; }
          const kind = id === "stays" ? "stay" : "tour";
          opened[kind] = a.dataset.partner;
          const box = $(id === "stays" ? "#bs-after" : "#bt-after");
          box.innerHTML = afterHtml(kind); box.hidden = false;
          return;
        }
        const b = e.target.closest("button");
        if (!b) return;
        if (b.id === "bs-near-off") { S.near = null; updateStay(); return; }
        if (b.id === "bt-copy") { MBB.copy(message()).then(ok => MBB.copied(ok, t("tours.copied"))); return; }
        if (b.dataset.add === "stay") MBB.trip.add("stay", { checkIn: S.in, checkOut: S.out, platform: NAMES[opened.stay] });
        if (b.dataset.add === "tour") MBB.trip.add("tour", { date: T.date, name: t("tours.tripName", { c: placeName(T.where) }), platform: NAMES[opened.tour], ...pickupFor(T) });
      });
    }
  }

  // A member's pseudonymous tag for affiliate links. Only asked for once a partner link has a template,
  // and a database without the column (supabase/schema.sql not run yet) just means no tag.
  async function loadTag() {
    const M = MBB.member?.state;
    if (!Object.keys(links).length || M?.status !== "member" || !M.sb || !M.user) {
      if (tag) { tag = ""; refreshGo(); }
      return;
    }
    try {
      const { data, error } = await M.sb.from("profiles").select("booking_tag").eq("id", M.user.id).maybeSingle();
      tag = !error && /^[a-z0-9]{8,32}$/.test(data?.booking_tag || "") ? data.booking_tag : "";
    } catch { tag = ""; }
    refreshGo();
  }

  /* ---------- from other screens ---------- */
  // A place page's "Find a stay nearby": its city or destination, and Booking.com searches around it.
  function nearFor(P) {
    const C = MBB.C, B = book();
    if ((P.kind === "city" || P.kind === "dest") && B[P.id]) return { where: P.id, near: null };
    if (P.kind === "pick") return null;
    if (P.kind === "poi" && B[P.city]) return { where: P.city, near: P };
    let best = null; // anything else: the closest city or destination within 50 km
    for (const [id, c] of [...Object.entries(C.cities), ...C.destinations.map(d => [d.id, d])]) {
      const d = B[id] && c.lat != null ? MBB.maps.km(c, P) : Infinity;
      if (d < 50 && (!best || d < best.d)) best = { id, d };
    }
    return best ? { where: best.id, near: P } : null;
  }
  function stayNear(P) {
    const n = nearFor(P);
    if (!n) return;
    S.where = n.where;
    S.near = n.near ? { name: n.near.local || n.near.name, label: n.near.name, lat: n.near.lat, lng: n.near.lng } : null;
    saveStay();
    MBB.go("stays");
  }
  // The planner's "Book a car for this plan": its city, today, half or full day, and the group.
  function fromPlan() {
    const b = MBB.planner.brief(), city = MBB.state.city;
    if (book()[city]?.tours) T.where = city;
    T.date = today();
    if (b) T.len = b.minutes <= 300 ? "half" : "full";
    const people = { solo: 1, couple: 2 }[b?.group];
    if (people) T.people = people;
    T.withPlan = true;
    saveTour();
    MBB.go("tours");
  }

  MBB.book = {
    init() {
      S = loadStay(); T = loadTour();
      bind();
      MBB.config().then(cfg => {
        links = Object.fromEntries(Object.entries(cfg?.links || {}).filter(([p, v]) => NAMES[p] && goodTemplate(v)));
        refreshGo();
        loadTag();
      });
      MBB.on("member", loadTag);
      // The pickup place in the driver's message follows My trip.
      MBB.on("trip", () => { if (visible("tours")) $("#bt-msg").textContent = message(); });
      window.addEventListener("online", refreshGo);
      window.addEventListener("offline", refreshGo);
    },
    renderStays, renderTours,
    stayNear, canStayNear: P => Boolean(nearFor(P)), fromPlan,
  };
})();
