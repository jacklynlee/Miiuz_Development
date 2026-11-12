/* Miiuz Beyond Borders — place pages (#place-<kind>-<id>):
 *   city-kl · dest-langkawi · poi-batu   the app's own places, with hand-written notes
 *   pick-nasi-lemak-wanjo                 Our Pick! food places (#50, js/picks.js)
 *   osm-N123456                          anything found on OpenStreetMap
 * Each shows a photo, what it is (plus a Wikipedia summary in the reader's language when
 * one exists), a street map, directions, a "show the driver" card, nearby Miiuz picks,
 * nearby essentials and one-tap questions for Miiuz. */
(function () {
  const MBB = window.MBB;
  const { $, esc, t, L, icon } = MBB;
  const osm = new Map();   // OpenStreetMap places from searches and lookups, by id
  const wikis = new Map(); // "title|lang" → summary | null
  let current = null;      // the place on screen

  const DEST_ICON = { island: "island", highlands: "mountain", city: "building", nature: "tree", mountain: "mountain", beach: "wave", dive: "fish" };
  // OpenStreetMap "category:type" → the app's place types.
  const TYPES = [
    [/^tourism:(attraction|artwork|gallery)$/, "attraction"], [/:museum$/, "museum"], [/:viewpoint$/, "viewpoint"],
    [/:(theme_park|water_park)$/, "themepark"], [/:(zoo|aquarium)$/, "zoo"],
    [/^tourism:(hotel|hostel|guest_house|motel|resort|chalet|apartment|camp_site)$/, "stay"],
    [/^amenity:(restaurant|fast_food|food_court)$/, "food"], [/^amenity:(cafe|ice_cream)$/, "cafe"], [/^amenity:(bar|pub|nightclub)$/, "bar"],
    [/^amenity:place_of_worship$/, "worship"], [/^amenity:(hospital|clinic|doctors)$/, "hospital"], [/^(amenity|shop):(pharmacy|chemist)$/, "pharmacy"],
    [/^amenity:police$/, "police"], [/^amenity:(bank|atm|bureau_de_change)$/, "money"], [/^amenity:marketplace$/, "market"],
    [/^amenity:(bus_station|ferry_terminal)$|^public_transport:|^railway:(station|halt)$/, "station"], [/^aeroway:(aerodrome|terminal)$/, "airport"],
    [/^shop:(mall|department_store)$/, "mall"], [/^shop:/, "shop"],
    [/^leisure:(park|garden|nature_reserve)$|^boundary:(national_park|protected_area)$/, "park"], [/^leisure:/, "leisure"],
    [/^natural:beach$/, "beach"], [/^natural:(peak|volcano|hill|ridge)$/, "mountain"], [/:waterfall$/, "waterfall"], [/^natural:cave_entrance$/, "cave"], [/^natural:/, "nature"],
    [/^place:(island|islet|archipelago)$/, "island"], [/^place:city$/, "city"], [/^place:town$/, "town"], [/^place:/, "area"],
    [/^historic:/, "historic"], [/^amenity:(school|university|college)$/, "school"], [/^highway:bus_stop$/, "station"], [/^highway:/, "road"], [/^building:/, "building"],
  ];
  const TYPE_ICON = {
    attraction: "star", museum: "landmark", viewpoint: "camera", themepark: "star", zoo: "tree", stay: "bed", food: "bowl", cafe: "bowl", bar: "bowl",
    worship: "landmark", hospital: "cross", pharmacy: "cross", police: "shield", money: "coins", market: "bag", station: "train", airport: "plane",
    mall: "bag", shop: "bag", park: "tree", leisure: "star", beach: "wave", mountain: "mountain", waterfall: "wave", cave: "mountain", nature: "tree",
    island: "island", city: "building", town: "building", area: "building", state: "map", historic: "landmark", school: "building", road: "pin",
    building: "building", place: "pin", highlands: "mountain", dive: "fish",
  };
  // App language → OpenStreetMap name:* keys, best first.
  const NAME_KEYS = { zh: ["zh-Hans", "zh-CN", "zh"], "zh-Hant": ["zh-Hant", "zh-TW", "zh-HK", "zh"], yue: ["yue", "zh-HK", "zh-Hant", "zh"], fil: ["fil", "tl"], nb: ["nb", "no"] };

  /* ---------- OpenStreetMap places ---------- */
  function osmType(p) {
    if (p.cat === "boundary" && p.type === "administrative") return ["state", "city", "town"].includes(p.kind) ? p.kind : "area";
    const k = `${p.cat}:${p.type}`;
    const type = TYPES.find(([re]) => re.test(k))?.[1] || "place";
    // A path or building with its own Wikipedia article (e.g. Langkawi Sky Bridge) is a sight.
    return ["road", "building", "place"].includes(type) && (p.tags?.wikidata || p.tags?.wikipedia) ? "attraction" : type;
  }
  const typeIcon = p => TYPE_ICON[osmType(p)] || "pin";
  function osmName(p) {
    const l = MBB.state.lang;
    for (const k of NAME_KEYS[l] || [l]) if (p.names?.[k]) return p.names[k];
    return p.names?.en || p.name;
  }
  const stateName = id => (MBB.C.states[id] ? L(MBB.C.states[id]) : "");
  const osmArea = p => [p.town, stateName(p.state) || p.stateName].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
  const osmSub = p => [t(`ptype.${osmType(p)}`), osmArea(p)].filter(Boolean).join(" · ");
  const remember = p => { if (p?.id) osm.set(p.id, { ...osm.get(p.id), ...p }); };

  // If an OpenStreetMap result is one of the app's own places, link to that page instead.
  function curatedFor(p) {
    const C = MBB.C, km = MBB.maps.km, n = MBB.search.norm(p.names?.en || p.name);
    const poi = C.pois.find(x => km(x, p) < 0.25);
    if (poi) return `#place-poi-${poi.id}`;
    const big = ["city", "town", "area", "state", "island", "park", "mountain", "nature"].includes(osmType(p));
    if (!big) return null;
    const d = C.destinations.find(x => km(x, p) < 25 && [x.name.en, ...(x.aka || [])].some(a => { const m = MBB.search.norm(a); return m && (n.includes(m) || m.includes(n)); }));
    if (d) return `#place-dest-${d.id}`;
    const c = Object.entries(C.cities).find(([, x]) => km(x, p) < 15 && [x.en, ...(x.aka || [])].some(a => MBB.search.norm(a) === n));
    return c ? `#place-city-${c[0]}` : null;
  }

  /* ---------- building a page model ---------- */
  const hh = h => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  function weekdays(list) {
    try { return list.map(d => new Date(2026, 1, 1 + d).toLocaleDateString(MBB.locale(), { weekday: "short" })).join(", "); } catch { return list.join(", "); }
  }

  function fromApp(kind, id) {
    const C = MBB.C;
    if (kind === "city") {
      const c = C.cities[id];
      if (!c) return null;
      return { kind, id, name: L(c), local: c.en, lat: c.lat, lng: c.lng, ic: "building", type: t("ptype.city"), area: stateName(c.state),
        photo: `city:${id}`, wp: c.wp?.[0], lead: L(c.sum), zoom: 12 };
    }
    if (kind === "dest") {
      const d = C.destinations.find(x => x.id === id);
      if (!d) return null;
      return { kind, id, name: L(d.name), local: d.name.en, lat: d.lat, lng: d.lng, ic: DEST_ICON[d.kind], type: t(`ptype.${d.kind}`), area: stateName(d.state),
        photo: `dest:${id}`, wp: d.wp[0], lead: L(d.sum), zoom: d.kind === "island" ? 10 : 11,
        facts: [["route", t("place.getThere"), L(d.go)], ["calendar", t("place.when"), L(d.when)]] };
    }
    if (kind === "poi") {
      const p = C.pois.find(x => x.id === id);
      if (!p) return null;
      const facts = [["clock", t("place.hours"), `${hh(p.o)}–${hh(p.c)}`], ["calendar", t("place.visit"), t("place.minutes", { n: p.d })],
        ["coins", t("place.cost"), t("plan.cost")[p.k]], ["sun", t("place.where"), t(p.in ? "place.indoor" : "place.outdoor")]];
      if (p.closed?.length) facts.push(["calendar", t("place.closedOn"), weekdays(p.closed)]);
      if (p.days?.length) facts.push(["calendar", t("place.openOn"), weekdays(p.days)]);
      return { kind, id, name: MBB.placeName(p), local: p.en, lat: p.lat, lng: p.lng, ic: "pin", type: p.t.map(k => t(`theme.${k}`)).join(" · "),
        area: L(C.cities[p.city]), city: p.city, photo: `poi:${id}`, wp: (C.photos.poi[id] || [])[0], lead: L(p.why), tip: L(p.tip), facts, zoom: 16 };
    }
    if (kind === "pick") return MBB.picks.place(id);
    return null;
  }

  function fromOsm(p) {
    const type = osmType(p);
    const tg = p.tags || {}, facts = [];
    if (tg.opening_hours) facts.push(["clock", t("place.hours"), tg.opening_hours]);
    if (tg.cuisine) facts.push(["bowl", t("place.cuisine"), tg.cuisine.replace(/;/g, ", ").replace(/_/g, " ")]);
    if (tg.fee || tg.charge) facts.push(["coins", t("place.cost"), tg.charge || (tg.fee === "no" ? t("place.free") : tg.fee === "yes" ? t("place.fee") : tg.fee)]);
    const zoom = { state: 8, city: 12, town: 13, island: 11, area: 14, park: 13, mountain: 13, nature: 13 }[type] || 16;
    return { kind: "osm", id: p.id, name: osmName(p), local: p.names?._ || p.name, lat: p.lat, lng: p.lng, ic: TYPE_ICON[type] || "pin",
      type: t(`ptype.${type}`), typeKey: type, area: osmArea(p), addr: p.addr, photoObj: p.photo || null, wiki: p.wiki, full: p.full, facts, zoom,
      phone: String(tg.phone || "").split(";")[0].trim(), web: /^https?:\/\//.test(tg.website || "") ? tg.website : "" };
  }

  /* ---------- pieces ---------- */
  function nearby(P) {
    const C = MBB.C, km = MBB.maps.km;
    const radius = P.kind === "osm" || P.kind === "poi" || P.kind === "pick" ? 3 : P.kind === "city" ? 8 : 0;
    const pois = radius ? C.pois.filter(p => !(P.kind === "poi" && p.id === P.id)).map(p => ({ p, d: km(P, p) })).filter(x => x.d <= radius).sort((a, b) => a.d - b.d).slice(0, 8)
      .map(({ p, d }) => ({ href: `#place-poi-${p.id}`, name: MBB.placeName(p), sub: L(C.cities[p.city]), photo: `poi:${p.id}`, ic: "pin", d, lat: p.lat, lng: p.lng })) : [];
    const dests = C.destinations.filter(d => !(P.kind === "dest" && d.id === P.id)).map(d => ({ d, x: km(P, d) })).filter(o => o.x <= 120).sort((a, b) => a.x - b.x).slice(0, 4)
      .map(({ d, x }) => ({ href: `#place-dest-${d.id}`, name: L(d.name), sub: stateName(d.state), photo: `dest:${d.id}`, ic: DEST_ICON[d.kind], d: x, lat: d.lat, lng: d.lng }));
    return { pois, dests };
  }
  const distance = km => MBB.dist(km); // miles first for travellers from the US

  const card = x => `<a class="near-card" href="${x.href}">${MBB.media.html(x.photo, { alt: "", ic: x.ic })}<span><b>${esc(x.name)}</b><small>${esc([distance(x.d), x.sub].filter(Boolean).join(" · "))}</small></span></a>`;

  // Destination card for Home and Search.
  const destCard = d => `<a class="dest-card" href="#place-dest-${d.id}">
      ${MBB.media.html(`dest:${d.id}`, { alt: "", ic: DEST_ICON[d.kind] })}
      <span><b>${esc(L(d.name))}</b><small>${esc(stateName(d.state))}</small></span>
    </a>`;

  function askChips(P) {
    const wide = P.kind === "dest" || P.kind === "city" || ["city", "town", "island", "state", "area"].includes(P.typeKey);
    const keys = wide ? ["do", "getThere", "stay", "plan"] : ["hours", "getThere", "food", "near"];
    return keys.map(k => `<button type="button" class="chip-btn" data-ask="${k}">${icon("spark")}${esc(t(`place.ask.${k}`))}</button>`).join("");
  }
  function askText(P, k) {
    const name = P.local && P.local !== P.name ? `${P.name} (${P.local})` : P.name;
    const city = MBB.C.cities[MBB.state.city];
    return t(`place.q.${k}`, { p: name, a: P.addr || P.area || "Malaysia", c: L(city) });
  }

  function wikiHtml(w) {
    if (!w) return "";
    const want = { zh: "zh", "zh-Hant": "zh", yue: "zh-yue", fil: "tl", nb: "no" }[MBB.state.lang] || MBB.state.lang;
    return `<section class="card pl-wiki">
      <h2>${icon("guide")}${esc(t("place.about"))}</h2>
      <p>${esc(w.text)}</p>
      <p class="hint">${esc(t("place.wikiSource"))} <a href="${esc(w.url)}" target="_blank" rel="noopener">Wikipedia</a> · CC BY-SA 4.0${w.wiki !== want ? ` · ${esc(t("place.wikiOther"))}` : ""}</p>
    </section>`;
  }

  async function loadWiki(P) {
    const slot = $("#pl-wiki");
    if (!slot) return;
    if (P.kind === "osm") { slot.innerHTML = wikiHtml(P.wiki); return; }
    if (!P.wp || window.claude) return;
    const key = `${P.wp}|${MBB.state.lang}`;
    if (!wikis.has(key)) {
      try {
        const r = await MBB.api(`api/places?wp=${encodeURIComponent(P.wp)}&lang=${encodeURIComponent(MBB.state.lang)}`);
        wikis.set(key, r.ok ? (await r.json()).wiki || null : null);
      } catch { return; }
    }
    if (current === P && slot.isConnected) slot.innerHTML = wikiHtml(wikis.get(key));
  }

  function heroHtml(P) {
    return MBB.media.html(P.photoObj || P.photo || "", { size: "l", alt: P.name, ic: P.ic, link: true });
  }

  function rememberRecent(P) {
    const href = `#place-${P.kind}-${P.id}`;
    const list = MBB.store.get("recent", []).filter(r => r.href !== href);
    list.unshift({ href, title: P.name, sub: [P.type, P.area].filter(Boolean).join(" · "), ic: P.ic, photo: P.photo || null });
    MBB.store.set("recent", list.slice(0, 8));
  }

  /* ---------- the page ---------- */
  function paint(view, P) {
    current = P;
    const { pois, dests } = nearby(P);
    const city = MBB.C.cities[MBB.state.city];
    const fromCity = P.kind === "city" && P.id === MBB.state.city ? 0 : MBB.maps.km(city, P);
    const facts = (P.facts || []).map(([ic, k, v]) => `<div class="fact">${icon(ic)}<span>${esc(k)}</span><b>${MBB.priceHtml(v)}</b></div>`).join("");
    const cityPicks = P.kind === "city" ? MBB.C.pois.filter(p => p.city === P.id).slice(0, 12)
      .map(p => ({ href: `#place-poi-${p.id}`, name: MBB.placeName(p), sub: p.t.map(k => t(`theme.${k}`)).join(" · "), photo: `poi:${p.id}`, ic: "pin", d: MBB.maps.km(P, p), lat: p.lat, lng: p.lng })) : [];
    // Google Maps searches near the place; English terms work best in Malaysia.
    const essentials = [["hospital", "cross", "hospital"], ["police", "shield", "police station"], ["atm", "coins", "ATM"], ["pharmacy", "cross", "pharmacy"], ["food", "bowl", "restaurants"], ["changer", "coins", "money changer"]];

    view.innerHTML = `
      <a class="back" href="#search" data-back>${icon("back")}${esc(t("search.title"))}</a>
      <div class="pl-hero" id="pl-photo">${heroHtml(P)}</div>
      <div class="pl-head">
        <p class="pl-type">${icon(P.ic)}<span>${esc(P.type)}</span>${P.kind === "pick" ? `<span class="pill teal">${MBB.picks.BRAND}</span>${P.pick.sponsored ? `<span class="pill warn">${esc(t("pick.sponsored"))}</span>` : ""}`
          : P.kind !== "osm" ? `<span class="pill teal">${esc(t("place.pick"))}</span>` : ""}</p>
        <h1>${esc(P.name)}</h1>
        ${P.local && P.local !== P.name ? `<p class="pl-local" lang="ms">${esc(P.local)}</p>` : ""}
        <p class="pl-area">${icon("pin")}${esc(P.addr || P.area || "")}</p>
      </div>
      ${P.lead ? `<p class="pl-lead">${esc(P.lead)}</p>` : ""}
      ${P.tip ? `<p class="pl-tip">${icon("spark")}<span>${esc(P.tip)}</span></p>` : ""}
      ${facts ? `<div class="facts pl-facts">${facts}</div>` : ""}
      ${P.phone || P.web ? `<div class="actions">
        ${P.phone ? `<a class="btn btn-ghost btn-sm" href="tel:${esc(P.phone.replace(/[^\d+]/g, ""))}">${icon("phone")}${esc(P.phone)}</a>` : ""}
        ${P.web ? `<a class="btn btn-ghost btn-sm" href="${esc(P.web)}" target="_blank" rel="noopener">${icon("external")}${esc(t("place.website"))}</a>` : ""}
      </div>` : ""}
      ${P.kind === "osm" ? `<p class="hint">${esc(t("place.osmNote"))} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></p>` : ""}

      <div class="actions pl-actions">
        <a class="btn btn-main btn-sm" href="https://www.google.com/maps/dir/?api=1&destination=${P.lat},${P.lng}" target="_blank" rel="noopener">${icon("route")}${esc(t("place.directions"))}</a>
        ${MBB.state.from === "CN" ? `<a class="btn btn-ghost btn-sm" href="${esc(MBB.maps.amap(P.lat, P.lng, P.name))}" target="_blank" rel="noopener">${esc(t("plan.amap"))}</a>
        <a class="btn btn-ghost btn-sm" href="${esc(MBB.maps.baidu(P.lat, P.lng, P.name))}" target="_blank" rel="noopener">${esc(t("place.baidu"))}</a>` : ""}
        <a class="btn btn-ghost btn-sm" href="https://waze.com/ul?ll=${P.lat},${P.lng}&navigate=yes" target="_blank" rel="noopener">Waze</a>
        <button type="button" class="btn btn-ghost btn-sm" id="pl-driver">${icon("expand")}${esc(t("tools.driverShow"))}</button>
        <button type="button" class="btn btn-ghost btn-sm" id="pl-share">${icon("share")}${esc(t("place.share"))}</button>
      </div>
      ${P.kind === "city" ? `<div class="actions"><button type="button" class="btn btn-ai btn-sm" id="pl-plan">${icon("plan")}${esc(t("place.planCity"))}</button></div>` : ""}
      ${P.kind === "poi" ? `<div class="actions"><button type="button" class="btn btn-ghost btn-sm" id="pl-plan">${icon("plan")}${esc(t("place.planCity"))} · ${esc(P.area)}</button></div>` : ""}
      ${P.kind === "pick" ? MBB.picks.pageHtml(P.pick) : ""}

      <section class="card pl-map">
        <h2>${icon("map")}${esc(t("place.map"))}</h2>
        <div class="street" id="pl-map"></div>
        <p class="hint" id="pl-dist">${esc([fromCity > 0.5 ? t("place.fromCity", { n: distance(fromCity), c: L(city) }) : "", MBB.trip.fromStay(P)].filter(Boolean).join(" · "))}</p>
        <button type="button" class="btn btn-ghost btn-sm" id="pl-locate">${icon("locate")}${esc(t("place.fromMe"))}</button>
      </section>

      <div id="pl-wiki"></div>

      ${MBB.features.ask ? `<section class="card pl-ask">
        <h2>${icon("spark")}${esc(t("place.askTitle"))}</h2>
        <div class="chips">${askChips(P)}</div>
      </section>` : ""}

      ${cityPicks.length ? `<section><div class="section-title"><h2>${esc(t("place.cityPicks", { c: P.name }))}</h2></div><div class="near-grid">${cityPicks.map(card).join("")}</div></section>` : ""}
      ${P.kind === "city" ? `<div id="pl-picks">${MBB.picks.sectionHtml(P.id)}</div>` : ""}
      ${pois.length && P.kind !== "city" ? `<section><div class="section-title"><h2>${esc(t("place.nearPicks"))}</h2></div><div class="near-grid">${pois.map(card).join("")}</div></section>` : ""}
      ${dests.length ? `<section><div class="section-title"><h2>${esc(t("place.nearDest"))}</h2></div><div class="near-grid">${dests.map(card).join("")}</div></section>` : ""}

      <section class="card pl-ess">
        <h2>${icon("cross")}${esc(t("place.essentials"))}</h2>
        <div class="links">${essentials.map(([k, ic, q]) => `<a href="https://www.google.com/maps/search/${encodeURIComponent(q)}/@${P.lat},${P.lng},15z" target="_blank" rel="noopener">${icon(ic)}${esc(t(`place.ess.${k}`))}${icon("external")}</a>`).join("")}</div>
      </section>

      <section class="card pl-where">
        <h2>${icon("globe")}${esc(t("place.inMalaysia"))}</h2>
        <div class="mymap-wrap small">${MBB.maps.overview({ here: P, labels: false })}</div>
      </section>`;

    $("#pl-driver").addEventListener("click", () => MBB.present({ kicker: MBB.C.driverCard.ms, big: P.local || P.name, sub: [P.local && P.local !== P.name ? P.name : "", P.addr || P.area].filter(Boolean).join(" · ") }));
    $("#pl-share").addEventListener("click", async () => {
      const data = { title: P.name, text: `${P.name} · Miiuz BB`, url: location.href };
      try { if (navigator.share && !MBB.install.wechat) { await navigator.share(data); return; } } catch (e) { if (e?.name === "AbortError") return; }
      MBB.copy(location.href).then(ok => MBB.copied(ok, t("member.linkCopied")));
    });
    $("#pl-plan")?.addEventListener("click", () => { MBB.setCity(P.kind === "city" ? P.id : P.city); MBB.go("plan"); });
    $("#pl-locate").addEventListener("click", () => {
      const out = $("#pl-dist");
      out.textContent = t("sos.locating");
      try {
        navigator.geolocation.getCurrentPosition(
          pos => { out.textContent = t("place.fromYou", { n: distance(MBB.maps.km({ lat: pos.coords.latitude, lng: pos.coords.longitude }, P)) }); },
          () => { out.textContent = t("sos.locFail"); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 });
      } catch { out.textContent = t("sos.locFail"); }
    });
    view.querySelector(".pl-ask")?.addEventListener("click", e => {
      const b = e.target.closest("[data-ask]");
      if (b) MBB.chat.askAbout(askText(P, b.dataset.ask));
    });

    const near = [...pois, ...cityPicks].map(({ lat, lng, name, href }) => ({ lat, lng, name, href }));
    MBB.maps.street($("#pl-map"), { lat: P.lat, lng: P.lng, name: P.name, zoom: P.zoom, near });
    loadWiki(P);
    rememberRecent(P);
  }

  function notFound(view) {
    current = null;
    view.innerHTML = `<a class="back" href="#search" data-back>${icon("back")}${esc(t("search.title"))}</a><p>${esc(t("place.notFound"))}</p>`;
  }

  async function renderOsm(view, id) {
    const have = osm.get(id);
    if (have) paint(view, fromOsm(have));
    else view.innerHTML = `<a class="back" href="#search" data-back>${icon("back")}${esc(t("search.title"))}</a><p class="hint">${esc(t("search.searching"))}</p>`;
    if (have?.full || window.claude) { if (!have) notFound(view); return; }
    try {
      const r = await MBB.api(`api/places?id=${encodeURIComponent(id)}&lang=${encodeURIComponent(MBB.state.lang)}`);
      if (!r.ok) throw new Error(String(r.status));
      const { place } = await r.json();
      remember({ ...place, full: true });
    } catch {
      if (!have) view.innerHTML = `<a class="back" href="#search" data-back>${icon("back")}${esc(t("search.title"))}</a><p class="hint">${esc(t("search.error"))}</p>`;
      return;
    }
    if (location.hash !== `#place-osm-${id}`) return;
    const P = fromOsm(osm.get(id));
    if (!have) return paint(view, P);
    // Already on screen: fill in the photo and Wikipedia summary without redrawing the map.
    current = P;
    if (P.photoObj) $("#pl-photo").innerHTML = heroHtml(P);
    $("#pl-wiki").innerHTML = wikiHtml(P.wiki);
  }

  function render(sub) {
    const view = $("#view-place");
    const m = /^(city|dest|poi|pick|osm)-(.+)$/.exec(sub || "");
    if (!m) return notFound(view);
    if (m[1] === "osm") return renderOsm(view, m[2]);
    const P = fromApp(m[1], m[2]);
    if (!P && m[1] === "pick" && MBB.picks.loading()) {
      // Opened from a link before the listings have arrived: they're on their way.
      current = null;
      view.innerHTML = `<a class="back" href="#search" data-back>${icon("back")}${esc(t("search.title"))}</a><p class="hint">${esc(t("search.searching"))}</p>`;
      return;
    }
    return P ? paint(view, P) : notFound(view);
  }

  // Photos arrive after the page is drawn the first time.
  MBB.on("media", () => { if (current && current.kind !== "osm" && $("#pl-photo")) $("#pl-photo").innerHTML = heroHtml(current); });
  // Our Pick! listings arrived or changed: a city page updates its strip, a pick's page is drawn again.
  MBB.on("picks", () => {
    const h = location.hash;
    if (current?.kind === "city" && $("#pl-picks")) $("#pl-picks").innerHTML = MBB.picks.sectionHtml(current.id);
    else if (h.startsWith("#place-pick-")) render(h.slice(7));
  });

  MBB.place = { render, remember, curatedFor, typeIcon, osmName, osmSub, destCard, DEST_ICON };
})();
