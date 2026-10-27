/* Miiuz Beyond Borders — maps.
 *  - overview(): an offline outline of Malaysia (js/data/malaysia.map.js) with a dot for each
 *    planner city and destination; tap a dot to open that place. Also a "where is it" locator.
 *  - street(): an interactive street map (MapLibre GL + OpenFreeMap tiles, free, no key),
 *    loaded only when a place page opens. Offline, blocked or in a Claude artifact, it falls
 *    back to the locator map plus a link to Google Maps. */
(function () {
  const MBB = window.MBB;
  const { esc, t, L, icon } = MBB;
  const LIB = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/";
  const STYLE = "https://tiles.openfreemap.org/styles/liberty";
  // Label side for dots that would otherwise collide: [anchor, dx, dy].
  const LABEL = {
    ipoh: ["end", -11, 5], cameron: ["start", 11, -6], taman_negara: ["end", -9, 20], kl: ["end", -11, 5], putrajaya: ["end", -11, 14],
    genting: ["start", 11, 6], frasers_hill: ["start", 11, -2], kota_bharu: ["end", -12, 4], perhentian: ["start", 11, -6], redang: ["start", 11, 9],
    kuala_terengganu: ["start", 11, 13], kota_kinabalu: ["end", -11, 5], kinabalu: ["start", 4, -14], sepilok: ["start", 11, 14], semporna: ["end", -11, 5],
  };
  const short = x => x.map?.[MBB.state.lang] || "";

  function xy(lat, lng) {
    const M = MBB.mapData;
    if (lng >= M.split) lng -= M.shift;
    const r = Math.PI / 180;
    return [M.k * lng * r + M.tx, M.ty - M.k * Math.log(Math.tan(Math.PI / 4 + (lat * r) / 2))];
  }

  // Everything the overview shows: the three planner cities and the destinations.
  function spots() {
    const C = MBB.C;
    return [
      ...Object.entries(C.cities).map(([id, c]) => ({ id, href: `#place-city-${id}`, name: L(c), label: short(c) || L(c), lat: c.lat, lng: c.lng, city: true })),
      ...C.destinations.map(d => ({ id: d.id, href: `#place-dest-${d.id}`, name: L(d.name), label: short(d) || L(d.name), lat: d.lat, lng: d.lng })),
    ];
  }

  /* Overview / locator. `here`: {lat, lng, name} highlights one point (locator mode). */
  function overview({ here = null, labels = true, cls = "" } = {}) {
    const M = MBB.mapData;
    if (!M) return "";
    const dots = spots().map(s => {
      const [x, y] = xy(s.lat, s.lng), [anchor, dx, dy] = LABEL[s.id] || ["start", 11, 5];
      return `<a href="${s.href}" class="mm-spot${s.city ? " city" : ""}" aria-label="${esc(s.name)}">
        <circle class="mm-hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="20"/>
        <circle class="mm-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.city ? 8 : 6.5}"/>
        ${labels ? `<text x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${esc(s.label)}</text>` : ""}
      </a>`;
    }).join("");
    let mark = "";
    if (here) {
      const [x, y] = xy(here.lat, here.lng);
      mark = `<g class="mm-here"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="22"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/></g>`;
    }
    return `<svg class="mymap ${here ? "locator" : ""} ${cls}" viewBox="0 0 ${M.w} ${M.h}" role="group" aria-label="${esc(t("map.label"))}">
      <rect class="mm-sea" width="${M.w}" height="${M.h}"/>
      <path class="mm-near" d="${M.near}"/>
      <path class="mm-land" d="${M.land}"/>
      <line class="mm-cut" x1="${M.cut}" y1="0" x2="${M.cut}" y2="${M.h}"/>
      <g class="mm-spots">${dots}</g>
      ${mark}
    </svg>`;
  }

  /* ---------- street map ---------- */
  let lib = null;
  function loadLib() {
    lib ??= new Promise((resolve, reject) => {
      if (window.maplibregl) return resolve(window.maplibregl);
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = LIB + "maplibre-gl.css";
      document.head.append(css);
      const s = document.createElement("script");
      s.src = LIB + "maplibre-gl.js"; s.async = true; s.crossOrigin = "anonymous";
      s.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("no maplibregl")));
      s.onerror = reject;
      document.head.append(s);
    }).catch(e => { lib = null; throw e; });
    return lib;
  }

  const gmaps = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  function fallback(el, o) {
    el.classList.add("street-off");
    el.innerHTML = `${overview({ here: o, labels: false })}
      <a class="btn btn-ghost btn-sm" href="${gmaps(o.lat, o.lng)}" target="_blank" rel="noopener">${icon("map")}${esc(t("map.google"))}</a>`;
  }

  // o: { lat, lng, name, zoom?, near?: [{lat, lng, name, href}] }
  async function street(el, o) {
    if (window.claude || navigator.onLine === false || !window.WebGLRenderingContext) return fallback(el, o);
    el.innerHTML = `<p class="hint street-wait">${esc(t("map.loading"))}</p>`;
    let ml;
    try { ml = await loadLib(); } catch { return fallback(el, o); }
    if (!el.isConnected) return;
    el.innerHTML = "";
    let ready = false, map;
    const give = () => { if (ready || !el.isConnected) return; try { map?.remove(); } catch { /* ignore */ } fallback(el, o); };
    try {
      map = new ml.Map({
        container: el, style: STYLE, center: [o.lng, o.lat], zoom: o.zoom || 14,
        attributionControl: { compact: true }, cooperativeGestures: true,
      });
    } catch { return fallback(el, o); }
    map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
    const pin = document.createElement("div");
    pin.className = "map-pin";
    pin.setAttribute("aria-label", o.name || "");
    new ml.Marker({ element: pin, anchor: "bottom" }).setLngLat([o.lng, o.lat]).addTo(map);
    for (const n of o.near || []) {
      const a = document.createElement("a");
      a.className = "map-dot"; a.href = n.href; a.title = n.name; a.setAttribute("aria-label", n.name);
      new ml.Marker({ element: a }).setLngLat([n.lng, n.lat]).addTo(map);
    }
    map.on("load", () => { ready = true; });
    map.on("error", give); // before the style loads, an error means no map; later ones are single tiles
    setTimeout(give, 12000);
  }

  // Straight-line distance in km.
  function km(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  MBB.maps = { overview, street, km, gmaps, spots };
})();
