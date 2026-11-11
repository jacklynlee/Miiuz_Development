/* Miiuz Beyond Borders — photos. The app's own destinations, places, dishes and souvenirs are
 * illustrated with freely licensed Wikimedia Commons photos found by /api/media; each photo
 * carries its author and licence, shown on the photo and on the #credits page. Without a
 * connection (or inside a Claude artifact) cards fall back to a coloured tile with an icon. */
(function () {
  const MBB = window.MBB;
  const { esc, t, L, icon } = MBB;
  const KEY = "media.v1", FRESH = 3 * 864e5;
  let items = {}, pending = null;
  const viewed = new Map(); // photos from place searches, for the credits page

  // The saved list is kept for 3 days, or until the app updates (a release can change the photos, #32).
  function load() {
    if (pending) return pending;
    const cached = MBB.store.get(KEY, null);
    if (cached?.items) items = cached.items;
    const build = MBB.update?.build() || null;
    pending = (async () => {
      if (window.claude || (cached && Date.now() - cached.at < FRESH && (!build || !cached.build || cached.build === build))) return;
      try {
        const r = await MBB.api("api/media");
        if (!r.ok) return;
        const j = await r.json();
        if (!j?.items) return;
        items = j.items;
        MBB.store.set(KEY, { at: Date.now(), build, items });
        MBB.emit("media");
      } catch { /* offline: keep what we have */ }
    })();
    return pending;
  }

  const get = key => items[key] || null;
  const credit = p => `${p.by} · ${p.lic}`;
  // Photos load through our own domain (api/photo.mjs, #39): Wikimedia is blocked in mainland China
  // and on Chinese roaming SIMs. The photo lists keep Commons' own addresses, so older copies of the
  // app and saved lists keep working. Inside a Claude artifact there's no /api, so it stays as it is.
  // Thumbnails are on thumb.wikimedia.org (with tracking parameters, dropped here), originals on upload.wikimedia.org.
  const COMMONS = /^https:\/\/(?:thumb|upload)\.wikimedia\.org\/wikipedia\/commons\/([^?#]+)/;
  const own = src => {
    const m = window.claude ? null : COMMONS.exec(String(src || ""));
    return m ? "/api/photo?p=" + encodeURIComponent(m[1]) : src;
  };

  // A photo with its credit, or a placeholder tile. size: "s" (cards) | "l" (page header).
  // link: make the credit a link to the photo's Commons page (not inside another link).
  function html(keyOrPhoto, { size = "s", alt = "", ic = "camera", cls = "", link = false } = {}) {
    const p = typeof keyOrPhoto === "string" ? get(keyOrPhoto) : keyOrPhoto;
    if (p && typeof keyOrPhoto !== "string") viewed.set(p.file, { p, label: alt });
    if (!p) return `<figure class="ph ph-none ${cls}" aria-hidden="true">${icon(ic)}</figure>`;
    const src = own(size === "l" ? p.srcL : p.src);
    return `<figure class="ph ${cls}">
      ${icon(ic)}
      <img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" crossorigin="anonymous" referrerpolicy="strict-origin-when-cross-origin"${p.w && p.h ? ` width="${p.w}" height="${p.h}"` : ""}>
      <figcaption>${link
        ? `<a href="${esc(p.page)}" target="_blank" rel="noopener" title="${esc(`${p.file} — ${credit(p)}`)}">${icon("camera")}<span>${esc(credit(p))}</span></a>`
        : `<span title="${esc(`${p.file} — ${credit(p)}`)}">${icon("camera")}<span>${esc(credit(p))}</span></span>`}</figcaption>
    </figure>`;
  }

  // A photo that fails to load turns back into the placeholder tile.
  document.addEventListener("error", e => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.parentElement?.classList.contains("ph")) {
      img.parentElement.classList.add("ph-none");
      img.remove();
    }
  }, true);

  /* ---------- names for the credits list ---------- */
  function label(key) {
    const C = MBB.C, [kind, id] = key.split(":");
    if (kind === "city") return L(C.cities[id]);
    if (kind === "dest") return L(C.destinations.find(d => d.id === id)?.name);
    if (kind === "poi") { const p = C.pois.find(x => x.id === id); return p ? MBB.placeName(p) : id; }
    if (kind === "dish") return C.guide.find(g => g.id === "food")?.dishes?.[Number(id)]?.ms || id;
    if (kind === "souv") return L(C.souvenirs.find(s => s.id === id)?.name);
    return id;
  }

  function renderCredits(view) {
    const rows = [];
    for (const [key, p] of Object.entries(items)) if (p) rows.push({ label: label(key), p });
    for (const { p, label: l } of viewed.values()) rows.push({ label: l, p });
    view.innerHTML = `
      <a class="back" href="#home" data-back>${icon("back")}${esc(t("nav.home"))}</a>
      <div class="view-head"><h1>${esc(t("credits.title"))}</h1><p>${esc(t("credits.lead"))}</p></div>
      ${rows.length ? `<ul class="credits">${rows.map(({ label: l, p }) => `<li>
        <img src="${esc(own(p.src))}" alt="" loading="lazy" crossorigin="anonymous" width="64" height="48">
        <div><b>${esc(l)}</b><small><a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(p.file)}</a> · ${esc(p.by)} · ${p.licUrl ? `<a href="${esc(p.licUrl)}" target="_blank" rel="noopener">${esc(p.lic)}</a>` : esc(p.lic)}</small></div>
      </li>`).join("")}</ul>` : `<p class="hint">${esc(t("credits.none"))}</p>`}
      <div class="card credits-more">
        <p>${esc(t("credits.maps"))} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a></p>
        <p>${esc(t("credits.text"))} <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a></p>
      </div>
      <div class="card credits-more credits-version">
        <p><b id="cr-version">${esc(t("credits.version", { v: MBB.update.label() }))}</b></p>
        <button type="button" class="btn btn-ghost btn-sm" id="cr-update">${icon("download")}${esc(t("update.check"))}</button>
      </div>`;
    MBB.$("#cr-update").addEventListener("click", () => MBB.update.checkNow());
  }

  MBB.media = { load, get, html, label, renderCredits };
})();
