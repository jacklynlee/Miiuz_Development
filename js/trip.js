/* Miiuz Beyond Borders — My trip (#5): every stay and car tour in one place, wherever it was booked.
 * Travellers add bookings by hand (reading confirmations with AI comes later). Bookings are kept on
 * the phone (mbb.trip). A member's bookings are also kept in their account (Supabase trip_bookings,
 * which only that member can read or change), so they're on every device they sign in on.
 * Home, the driver card, SOS, place pages and the planner use them. Passport and ID numbers are
 * never asked for, and bookings added here never earn points (#8). */
(function () {
  const MBB = window.MBB;
  const { $, esc, t, L, icon } = MBB;
  const KEY = "trip", GONE = "trip.gone";
  const PLATFORMS = ["Agoda", "Booking.com", "Airbnb", "Trip.com", "Klook", "KKday", "Expedia", "Traveloka"];
  // The only fields kept for each kind: anything else is dropped when saving or syncing.
  const FIELDS = {
    stay: ["name", "address", "checkIn", "checkInTime", "checkOut", "checkOutTime", "platform", "ref", "phone", "lat", "lng"],
    tour: ["name", "date", "start", "end", "pickup", "operator", "licence", "driver", "phone", "plate", "vehicle", "guide", "guideLang", "platform", "ref", "lat", "lng"],
  };
  const MAX = { name: 120, address: 300, pickup: 300, platform: 40, ref: 60, phone: 24, operator: 120, licence: 40, driver: 80, plate: 20, vehicle: 60, guide: 80, guideLang: 40 };
  const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
  const isDate = f => f === "checkIn" || f === "checkOut" || f === "date";
  const isTime = f => f === "checkInTime" || f === "checkOutTime" || f === "start" || f === "end";

  const uuid = () => {
    try { return crypto.randomUUID(); } catch { /* older browsers, or not https */ }
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };

  // A booking with only known, valid fields, or null.
  function clean(b) {
    if (!b || typeof b !== "object" || !FIELDS[b.kind] || !/^[0-9a-f-]{36}$/i.test(String(b.id || ""))) return null;
    const out = { id: String(b.id), kind: b.kind, updated: Number(b.updated) || Date.now() };
    for (const f of FIELDS[b.kind]) {
      const v = b[f];
      if (v == null || v === "") continue;
      if (f === "lat" || f === "lng") { const n = Number(v); if (Number.isFinite(n)) out[f] = n; continue; }
      const s = String(v).trim().slice(0, MAX[f] || 10);
      if (isDate(f) ? DATE.test(s) : isTime(f) ? TIME.test(s) : s) out[f] = s;
    }
    if (out.lat == null || out.lng == null) { delete out.lat; delete out.lng; }
    if (b.owner) out.owner = String(b.owner);
    return out.name && (out.kind === "stay" ? out.checkIn : out.date) ? out : null;
  }

  const read = () => { const a = MBB.store.get(KEY, []); return Array.isArray(a) ? a.map(clean).filter(Boolean) : []; };
  let list = read();

  function save(next, { sync = true } = {}) {
    list = next.map(clean).filter(Boolean);
    MBB.store.set(KEY, list);
    autoHotel();
    MBB.emit("trip");
    if (sync) queueSync();
  }

  /* ---------- dates (Malaysia time) ---------- */
  function today() {
    try {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: MBB.C.timezone, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date()).reduce((o, x) => ((o[x.type] = x.value), o), {});
      return `${p.year}-${p.month}-${p.day}`;
    } catch { return new Date().toISOString().slice(0, 10); }
  }
  const first = b => (b.kind === "stay" ? b.checkIn : b.date);
  const last = b => (b.kind === "stay" ? b.checkOut || b.checkIn : b.date);
  const sortKey = b => `${first(b)} ${(b.kind === "stay" ? b.checkInTime : b.start) || "99:99"}`;
  const sorted = () => [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const upcoming = () => sorted().filter(b => last(b) >= today());
  const past = () => sorted().filter(b => last(b) < today()).reverse();
  // Where the traveller sleeps on a date: on a changeover day, the stay they move into.
  const stayOn = (day = today()) => sorted().filter(b => b.kind === "stay" && b.checkIn <= day && day <= last(b)).pop() || null;
  const toursOn = (day = today()) => sorted().filter(b => b.kind === "tour" && b.date === day);

  function dayLabel(d) {
    try {
      const [y, m, dd] = d.split("-").map(Number);
      return new Intl.DateTimeFormat(MBB.locale(), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, dd));
    } catch { return d; }
  }
  const time = hm => (hm ? MBB.clock(Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))) : "");
  const when = (d, hm) => [dayLabel(d), time(hm)].filter(Boolean).join(" ");
  const arrow = () => (document.documentElement.dir === "rtl" ? "←" : "→");
  function nights(b) {
    const n = Math.round((Date.parse(b.checkOut) - Date.parse(b.checkIn)) / 864e5);
    return n > 0 ? (MBB.state.lang === "en" && n === 1 ? "1 night" : t("trip.nights", { n })) : "";
  }
  const count = n => (MBB.state.lang === "en" && n === 1 ? "1 booking" : t("trip.count", { n }));
  const tel = p => String(p).replace(/[^\d+]/g, "");
  const telLink = p => `<a href="tel:${esc(tel(p))}" dir="ltr">${esc(p)}</a>`;
  const placeText = b => (b.kind === "stay" ? [b.name, b.address] : [b.pickup]).filter(Boolean).join(", ");
  const directions = b => `https://www.google.com/maps/dir/?api=1&destination=${b.lat != null ? `${b.lat},${b.lng}` : encodeURIComponent(placeText(b))}`;

  /* ---------- the driver card follows the current stay ---------- */
  // Fills the saved hotel (driver card, SOS) with the current stay, unless the traveller typed their own.
  function autoHotel() {
    const s = stayOn();
    if (!s) return;
    const text = [s.name, s.address].filter(Boolean).join("\n");
    const hotel = MBB.store.get("hotel", ""), auto = MBB.store.get("hotel.auto", null);
    if (hotel === text || (hotel.trim() && hotel !== auto)) return;
    MBB.store.set("hotel", text);
    MBB.store.set("hotel.auto", text);
    MBB.emit("hotel");
  }

  function showDriver(b) {
    const d = MBB.C.driverCard;
    const gloss = L(d) === d.en ? d.en : `${L(d)} · ${d.en}`;
    if (b.kind === "stay") MBB.present({ kicker: d.ms, big: b.name, sub: b.address || gloss });
    else MBB.present({ kicker: d.ms, big: b.pickup || b.name, sub: gloss });
  }

  /* ---------- the page (#trip) ---------- */
  let editing = null; // { kind, id?, draft? } while the form is open
  let found = [];     // map search results for the open form

  const view = () => $("#view-trip");
  const member = () => MBB.member?.state;

  function fact(key, value, html = false) {
    return value ? `<dt>${esc(t(key))}</dt><dd>${html ? value : esc(value)}</dd>` : "";
  }
  function itemHtml(b) {
    const stay = b.kind === "stay";
    const now = stay ? stayOn()?.id === b.id : b.date === today();
    const sub = [t(stay ? "trip.stay" : "trip.tour"), b.platform].filter(Boolean).join(" · ");
    const span = stay
      ? `${when(b.checkIn, b.checkInTime)} ${arrow()} ${when(b.checkOut, b.checkOutTime)}${nights(b) ? ` · ${nights(b)}` : ""}`
      : `${dayLabel(b.date)}${b.start ? ` · ${time(b.start)}${b.end ? `–${time(b.end)}` : ""}` : ""}`;
    const facts = stay
      ? fact("trip.f.address", b.address) + fact("trip.f.ref", b.ref) +
        fact("trip.f.phone", b.phone && telLink(b.phone), true)
      : fact("trip.f.pickup", b.pickup) +
        fact("trip.driver", [b.driver, b.phone && telLink(b.phone)].filter(Boolean).map((x, i) => (i ? x : esc(x))).join(" · "), true) +
        fact("trip.car", [b.plate, b.vehicle].filter(Boolean).join(" · ")) +
        fact("trip.f.guide", [b.guide, b.guideLang].filter(Boolean).join(" · ")) +
        fact("trip.f.operator", [b.operator, b.licence].filter(Boolean).join(" · ")) +
        fact("trip.f.ref", b.ref);
    const where = placeText(b);
    return `<article class="card trip-item${now ? " now" : ""}" id="tb-${b.id}">
      <div class="trip-top">
        <span class="badge-ic">${icon(stay ? "bed" : "car")}</span>
        <div><p>${esc(sub)}</p><h3>${esc(b.name)}</h3><p>${esc(span)}</p></div>
        ${now ? `<span class="pill teal">${esc(t(stay ? "trip.now" : "trip.today"))}</span>` : ""}
      </div>
      ${facts ? `<dl class="trip-facts">${facts}</dl>` : ""}
      <div class="actions">
        ${where ? `<button type="button" class="btn btn-main btn-sm" data-driver="${b.id}">${icon("expand")}${esc(t("tools.driverShow"))}</button>
        <a class="btn btn-ghost btn-sm" href="${esc(directions(b))}" target="_blank" rel="noopener">${icon("route")}${esc(t("place.directions"))}</a>` : ""}
        <button type="button" class="btn btn-ghost btn-sm" data-edit="${b.id}">${esc(t("trip.edit"))}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-del="${b.id}">${esc(t("trip.delete"))}</button>
      </div>
    </article>`;
  }

  function input(b, f, { type = "text", label = `trip.f.${f}`, req = false, extra = "" } = {}) {
    return `<label for="tf-${f}"><span>${esc(t(label))}${req ? ` <b class="req" aria-hidden="true">*</b>` : ""}</span>
      <input id="tf-${f}" name="${f}" type="${type}"${MAX[f] ? ` maxlength="${MAX[f]}"` : ""}${req ? " required" : ""} autocomplete="off"${type === "tel" ? ' dir="ltr"' : type === "text" ? ' dir="auto"' : ""} value="${esc(b[f] ?? "")}"${extra}></label>`;
  }
  function area(b, f) {
    return `<label for="tf-${f}">${esc(t(`trip.f.${f}`))}<textarea id="tf-${f}" name="${f}" rows="2" maxlength="${MAX[f]}" autocomplete="off" dir="auto">${esc(b[f] ?? "")}</textarea></label>`;
  }
  function pinHtml(b) {
    return b.lat != null
      ? `<p class="trip-pin">${icon("check")}<span>${esc(t("trip.onMap"))}</span><button type="button" class="btn btn-ghost btn-sm" data-unpin>${esc(t("trip.unpin"))}</button></p>`
      : "";
  }
  function formHtml(kind, b) {
    const stay = kind === "stay";
    const head = t(b.id ? (stay ? "trip.editStay" : "trip.editTour") : (stay ? "trip.addStay" : "trip.addTour"));
    const fields = stay
      ? `${input(b, "name", { req: true })}
        ${area(b, "address")}
        <div class="row">${input(b, "checkIn", { type: "date", req: true })}${input(b, "checkInTime", { type: "time", label: "trip.f.time" })}</div>
        <div class="row">${input(b, "checkOut", { type: "date", req: true })}${input(b, "checkOutTime", { type: "time", label: "trip.f.time" })}</div>
        ${input(b, "phone", { type: "tel", extra: ' inputmode="tel"' })}
        <div class="row">${input(b, "platform", { extra: ' list="tf-platforms"' })}${input(b, "ref")}</div>`
      : `${input(b, "name", { label: "trip.f.tourName", req: true })}
        <div class="row">${input(b, "date", { type: "date", req: true })}${input(b, "start", { type: "time" })}${input(b, "end", { type: "time" })}</div>
        ${area(b, "pickup")}
        <div class="row">${input(b, "driver")}${input(b, "phone", { type: "tel", label: "trip.f.driverPhone", extra: ' inputmode="tel"' })}</div>
        <div class="row">${input(b, "plate")}${input(b, "vehicle")}</div>
        <div class="row">${input(b, "guide", { label: "trip.f.guideName" })}${input(b, "guideLang")}</div>
        <div class="row">${input(b, "operator")}${input(b, "licence")}</div>
        <div class="row">${input(b, "platform", { extra: ' list="tf-platforms"' })}${input(b, "ref")}</div>`;
    return `<form class="card trip-form" id="tf" data-kind="${kind}" data-id="${esc(b.id || "")}" novalidate>
      <h2>${esc(head)}</h2>
      ${fields}
      <datalist id="tf-platforms">${PLATFORMS.map(p => `<option value="${p}">`).join("")}</datalist>
      <div class="trip-map">
        <input type="hidden" name="lat" value="${b.lat ?? ""}"><input type="hidden" name="lng" value="${b.lng ?? ""}">
        <p class="hint">${esc(t(stay ? "trip.mapWhy" : "trip.mapWhyTour"))}</p>
        <div id="tf-pin">${pinHtml(b)}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="tf-find">${icon("search")}${esc(t("trip.findMap"))}</button>
        <div id="tf-found" aria-live="polite"></div>
      </div>
      <p class="hint">${esc(t("trip.noIds"))}</p>
      <div class="actions">
        <button type="submit" class="btn btn-main">${esc(t("trip.save"))}</button>
        <button type="button" class="btn btn-ghost" id="tf-cancel">${esc(t("trip.cancel"))}</button>
      </div>
    </form>`;
  }

  function listsHtml() {
    const up = upcoming(), old = past();
    return `${up.length ? `<section class="trip-list"><div class="section-title"><h2>${esc(t("trip.upcoming"))}</h2></div>${up.map(itemHtml).join("")}</section>`
      : `<p class="card trip-empty">${esc(t(list.length ? "trip.noneUpcoming" : "trip.empty"))}</p>`}
      ${old.length ? `<details class="trip-past"><summary>${esc(t("trip.past"))} (${old.length})</summary>${old.map(itemHtml).join("")}</details>` : ""}
      <p class="hint">${esc(t(member()?.status === "member" ? "trip.savedAccount" : "trip.savedLocal"))}</p>`;
  }

  function render() {
    const v = view();
    if (!v) return;
    const form = $("#tf", v);
    if (form && editing) editing.draft = fromForm(form); // keep what was typed (e.g. language change)
    const b = editing ? editing.draft || list.find(x => x.id === editing.id) || {} : null;
    v.innerHTML = `
      <div class="view-head"><h1>${esc(t("trip.title"))}</h1><p>${esc(t("trip.lead"))}</p></div>
      <div class="actions">
        <button type="button" class="btn btn-main" data-add="stay">${icon("bed")}${esc(t("trip.addStay"))}</button>
        <button type="button" class="btn btn-ghost" data-add="tour">${icon("car")}${esc(t("trip.addTour"))}</button>
      </div>
      ${editing ? formHtml(editing.kind, b) : ""}
      <div id="t-lists">${listsHtml()}</div>`;
  }
  // Bookings changed (saved, deleted, synced): redraw the lists only, so an open form keeps its text.
  function refreshLists() {
    const el = $("#t-lists");
    if (el) el.innerHTML = listsHtml();
  }

  function fromForm(form) {
    const fd = new FormData(form);
    const b = { id: form.dataset.id || "", kind: form.dataset.kind };
    for (const f of FIELDS[b.kind]) { const v = fd.get(f); if (v != null && String(v).trim() !== "") b[f] = String(v).trim(); }
    return b;
  }

  function open(kind, id = null) {
    found = [];
    if (id) { editing = { kind, id }; }
    else {
      const draft = { kind };
      if (kind === "tour") { draft.date = today(); Object.assign(draft, pickupFrom(stayOn(draft.date))); }
      editing = { kind, draft };
    }
    render();
    const form = $("#tf");
    if (!id && kind === "tour") form.elements.pickup.dataset.auto = form.elements.pickup.value; // filled in for them, not typed
    form.scrollIntoView({ block: "start" });
    $("input[name=name]", form).focus({ preventScroll: true });
  }
  function close() { editing = null; found = []; render(); }

  // A tour's pickup defaults to where the traveller stays that day.
  function pickupFrom(s) {
    return s ? { pickup: [s.name, s.address].filter(Boolean).join("\n"), ...(s.lat != null ? { lat: s.lat, lng: s.lng } : {}) } : {};
  }

  function submit(form) {
    const b = fromForm(form);
    const bad = (sel, key) => { MBB.toast(t(key), { type: "error" }); $(sel, form)?.focus(); return true; };
    if (!b.name && bad("#tf-name", "trip.needName")) return;
    if (b.kind === "stay") {
      if ((!b.checkIn || !b.checkOut) && bad(b.checkIn ? "#tf-checkOut" : "#tf-checkIn", "trip.needDates")) return;
      if (b.checkOut < b.checkIn && bad("#tf-checkOut", "trip.badDates")) return;
    } else if (!b.date && bad("#tf-date", "trip.needDates")) return;
    const old = list.find(x => x.id === b.id);
    const item = { ...b, id: old ? old.id : uuid(), updated: Date.now(), owner: old?.owner };
    save([...list.filter(x => x.id !== item.id), item]);
    editing = null; found = [];
    render();
    MBB.toast(t("trip.saved"), { type: "success" });
    requestAnimationFrame(() => $(`#tb-${item.id}`)?.scrollIntoView({ block: "center" }));
  }

  function remove(id) {
    const b = list.find(x => x.id === id);
    if (!b) return;
    if (b.owner) MBB.store.set(GONE, [...new Set([...MBB.store.get(GONE, []), id])]);
    save(list.filter(x => x.id !== id));
    MBB.toast(t("trip.deleted"), {
      action: {
        label: t("trip.undo"),
        // Back as a new booking, so it's saved to the account again even if the delete reached it.
        run: () => { MBB.store.set(GONE, MBB.store.get(GONE, []).filter(x => x !== id)); save([...list, { ...b, owner: null, updated: Date.now() }]); },
      },
    });
  }

  async function findOnMap(form) {
    const out = $("#tf-found", form), b = fromForm(form);
    const tries = (b.kind === "stay" ? [b.name, `${b.name} ${b.address || ""}`, b.address] : [b.pickup?.split("\n")[0], b.pickup])
      .map(x => String(x || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 150)).filter((x, i, a) => x && a.indexOf(x) === i);
    if (!tries.length) { MBB.toast(t(b.kind === "stay" ? "trip.needName" : "trip.needPickup"), { type: "error" }); return; }
    if (window.claude || navigator.onLine === false) { out.innerHTML = `<p class="hint">${esc(t("trip.mapOff"))}</p>`; return; }
    out.innerHTML = `<p class="hint">${esc(t("search.searching"))}</p>`;
    found = [];
    try {
      for (const q of tries) {
        const r = await MBB.api(`api/places?q=${encodeURIComponent(q)}`);
        if (!r.ok) throw new Error(String(r.status));
        found = ((await r.json()).results || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)).slice(0, 5);
        if (found.length) break;
      }
      out.innerHTML = found.length
        ? `<p class="hint">${esc(t("trip.mapPick"))}</p><div class="s-list">${found.map((p, i) => `<button type="button" class="s-row" data-pick="${i}">
            <span class="badge-ic">${icon("pin")}</span><span><b>${esc(p.name)}</b><small>${esc(p.addr || "")}</small></span>${icon("check", "next")}</button>`).join("")}</div>`
        : `<p class="hint">${esc(t("trip.mapNone"))}</p>`;
    } catch {
      out.innerHTML = `<p class="hint">${esc(t("search.error"))}</p>`;
    }
  }
  function pick(form, p) {
    form.elements.lat.value = p.lat; form.elements.lng.value = p.lng;
    const addr = form.elements.address;
    if (addr && !addr.value.trim() && p.addr) addr.value = p.addr;
    $("#tf-pin", form).innerHTML = pinHtml(p);
    $("#tf-found", form).innerHTML = "";
    found = [];
  }

  function bind() {
    const v = view();
    v.addEventListener("click", e => {
      const el = e.target.closest("button");
      if (!el) return;
      const form = $("#tf", v);
      if (el.dataset.add) return open(el.dataset.add);
      if (el.dataset.edit) { const b = list.find(x => x.id === el.dataset.edit); if (b) open(b.kind, b.id); return; }
      if (el.dataset.del) return remove(el.dataset.del);
      if (el.dataset.driver) { const b = list.find(x => x.id === el.dataset.driver); if (b) showDriver(b); return; }
      if (!form) return;
      if (el.id === "tf-cancel") return close();
      if (el.id === "tf-find") return findOnMap(form);
      if (el.dataset.pick != null && found[el.dataset.pick]) return pick(form, found[el.dataset.pick]);
      if (el.hasAttribute("data-unpin")) { form.elements.lat.value = ""; form.elements.lng.value = ""; $("#tf-pin", form).innerHTML = ""; }
    });
    v.addEventListener("submit", e => { e.preventDefault(); submit(e.target); });
    // A new tour's pickup follows its date, until the traveller types their own.
    v.addEventListener("change", e => {
      const form = e.target.closest("#tf");
      if (!form || e.target.name !== "date" || form.dataset.id) return;
      const pu = form.elements.pickup, auto = pickupFrom(stayOn(e.target.value));
      if (pu.value.trim() && pu.dataset.auto !== pu.value) return;
      pu.value = auto.pickup || ""; pu.dataset.auto = pu.value;
      form.elements.lat.value = auto.lat ?? ""; form.elements.lng.value = auto.lng ?? "";
      $("#tf-pin", form).innerHTML = pinHtml(auto);
    });
  }

  /* ---------- members: keep bookings in the account ---------- */
  let syncing = false, again = false, timer = null, owner = null;
  const queueSync = () => { clearTimeout(timer); timer = setTimeout(sync, 600); };
  const toRow = b => ({
    id: b.id, kind: b.kind,
    details: Object.fromEntries(FIELDS[b.kind].filter(f => b[f] != null).map(f => [f, b[f]])),
    starts_on: first(b), ends_on: last(b), updated_at: new Date(b.updated).toISOString(),
  });
  const fromRow = (r, uid) => clean({ ...(r.details || {}), id: r.id, kind: r.kind, updated: Date.parse(r.updated_at), owner: uid });

  // Two-way merge, newest edit wins. A booking that was in the account and isn't any more was
  // deleted on another device. Deletes made offline wait in mbb.trip.gone.
  async function sync() {
    const M = member();
    if (!M || M.status !== "member" || !M.sb || !M.user || navigator.onLine === false) return;
    if (syncing) { again = true; return; }
    syncing = true;
    const before = list;
    try {
      const uid = M.user.id, db = M.sb.from("trip_bookings");
      const gone = MBB.store.get(GONE, []);
      if (gone.length) {
        const { error } = await M.sb.from("trip_bookings").delete().in("id", gone);
        if (error) throw error;
        MBB.store.set(GONE, MBB.store.get(GONE, []).filter(id => !gone.includes(id)));
      }
      const { data, error } = await db.select("id, kind, details, updated_at");
      if (error) throw error;
      const server = new Map();
      for (const r of data || []) { const b = fromRow(r, uid); if (b) server.set(b.id, b); }
      const next = [], up = [];
      for (const b of list) {
        const s = server.get(b.id);
        if (s) { server.delete(b.id); if (b.updated > s.updated) { next.push(b); up.push(b); } else next.push(s); }
        else if (!b.owner) { next.push(b); up.push(b); }
      }
      next.push(...server.values());
      if (up.length) {
        const { error: e } = await M.sb.from("trip_bookings").upsert(up.map(toRow));
        if (!e) up.forEach(b => (b.owner = uid));
      }
      owner = uid;
      if (list !== before) again = true; // changed while we were syncing: merge again
      else save(next, { sync: false });
    } catch { /* offline, or the table isn't set up yet: bookings stay on the phone, try again later */ }
    finally { syncing = false; if (again) { again = false; queueSync(); } }
  }

  function onMember() {
    const M = member();
    if (!M) return;
    if (M.status === "member" && M.user && owner !== M.user.id) sync();
    // Signed out: the account's bookings leave this phone (they come back on sign-in).
    if (M.status === "guest" && list.some(b => b.owner)) { owner = null; MBB.store.set(GONE, []); save(list.filter(b => !b.owner), { sync: false }); }
    if (location.hash === "#trip") refreshLists();
  }

  /* ---------- used by other screens ---------- */
  // Home: what's on now and next.
  function homeHtml() {
    const now = today(), rows = [];
    const row = (b, title, sub) => `<a href="#trip" data-scroll="tb-${b.id}"><span class="badge-ic">${icon(b.kind === "stay" ? "bed" : "car")}</span>
      <span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${icon("next", "next")}</a>`;
    const s = stayOn(now);
    if (s) rows.push(row(s, t("trip.stayingAt", { s: s.name }), s.checkIn === now
      ? t("trip.checkInOn", { d: when(s.checkIn, s.checkInTime) })
      : t("trip.checkOutOn", { d: when(s.checkOut, s.checkOutTime) })));
    for (const b of toursOn(now)) rows.push(row(b, t("trip.todayAt", { s: b.name }), [b.start ? t("trip.pickupOn", { d: time(b.start) }) : "", b.pickup?.split("\n")[0]].filter(Boolean).join(" · ")));
    const next = upcoming().find(b => first(b) > now);
    if (next) rows.push(row(next, t("trip.nextAt", { s: next.name }), next.kind === "stay" ? when(next.checkIn, next.checkInTime) : when(next.date, next.start)));
    if (!rows.length) return "";
    return `<section>
        <div class="section-title"><h2>${esc(t("trip.title"))}</h2><a href="#trip">${esc(t("home.more"))}</a></div>
        <div class="quick">${rows.slice(0, 3).join("")}</div>
      </section>`;
  }

  // The planner tab's link to My trip.
  function planLink() {
    const el = $("#p-trip");
    if (!el) return;
    const s = stayOn(), n = upcoming().length;
    const sub = s ? t("trip.stayingAt", { s: s.name }) : n ? count(n) : t("trip.planLinkEmpty");
    el.innerHTML = `<a href="#trip"><span class="badge-ic">${icon("bed")}</span><span><b>${esc(t("trip.title"))}</b><small>${esc(sub)}</small></span>${icon("next", "next")}</a>`;
  }

  // SOS: where I'm staying, and today's driver.
  function sosHtml() {
    const s = stayOn();
    const call = p => (p ? `<a class="icon-btn" href="tel:${esc(tel(p))}">${icon("phone")}${esc(t("sos.call"))}</a>` : "");
    let h = s ? `<div class="sos-em sos-trip"><span><b>${esc(t("sos.myStay"))}</b><small>${esc([s.name, s.address, s.phone].filter(Boolean).join(" · "))}</small></span>${call(s.phone)}</div>` : "";
    for (const b of toursOn()) {
      const who = [b.driver, b.phone, [b.plate, b.vehicle].filter(Boolean).join(" "), [b.operator, b.licence].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
      h += `<div class="sos-em sos-trip"><span><b>${esc(t("sos.myTour"))}: ${esc(b.name)}</b><small>${esc(who)}</small></span>${call(b.phone)}</div>`;
    }
    return h;
  }

  // Place pages: distance from the current stay, if it's on the map.
  function fromStay(p) {
    const s = stayOn();
    if (!s || s.lat == null || !p) return "";
    const d = MBB.maps.km(s, p);
    return d < 0.05 ? "" : t("place.fromStay", { n: MBB.dist(d) });
  }

  // The planner can start and end the day at the current stay, when it's on the map and in that city.
  function base(city) {
    const s = stayOn();
    if (!s || s.lat == null || (city && MBB.maps.km(s, city) > 40)) return null;
    return { lat: s.lat, lng: s.lng, name: s.name };
  }

  MBB.trip = {
    init() {
      bind();
      autoHotel();
      // The page itself is redrawn by app.js (routing, language and home-country changes).
      MBB.on("trip", () => { planLink(); if (location.hash === "#trip") refreshLists(); });
      MBB.on("lang", planLink);
      MBB.on("member", onMember);
      window.addEventListener("online", queueSync);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") queueSync(); });
      planLink();
    },
    render,
    homeHtml, sosHtml, fromStay, base,
    stayOn, list: () => [...list],
  };
})();
