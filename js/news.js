/* Miiuz Beyond Borders — what's new (#68).
 * Travellers who had an older version find out about new features once, without extra cards:
 *  - a dot on the tab, and on the links, that lead to a new feature, until they open it;
 *  - "New" next to that screen's title the first time they open it (the screen's own intro says
 *    what it does);
 *  - after an update, one message listing what's new, with "Show me".
 * Someone opening Miiuz for the first time sees none of it: for them nothing is new.
 * A feature already used (its saved data is there) counts as seen. Hints retire two minor versions
 * after the one they came with. Saved on this phone ("mbb.news.*"), so it works offline.
 *
 * Each release adds its new features to NEWS:
 *   id    a short name, kept for good (it's saved as seen)
 *   v     the version the feature came with
 *   view  the screen that gets "New" next to its title (#<view>)
 *   tab   the tab that gets the dot
 *   link  optional: links to this address get the dot too, wherever they are ("#stays")
 *   name  the string key of the feature's name, for the message after an update
 *   used  optional: true when saved data shows the traveller already used it */
(function () {
  const MBB = window.MBB;
  const { store, t, $, $$, esc } = MBB;

  const NEWS = [
    { id: "explore", v: "1.1.0", view: "explore", tab: "explore", name: "nav.explore" },
    { id: "trip", v: "1.1.0", view: "trip", tab: "trip", name: "nav.trip", used: () => (store.get("trip", []) || []).length > 0 },
    { id: "stays", v: "1.1.0", view: "stays", tab: "explore", link: "#stays", name: "stays.title", used: () => store.get("book.stay", null) != null },
    { id: "tours", v: "1.1.0", view: "tours", tab: "explore", link: "#tours", name: "tours.title", used: () => store.get("book.tour", null) != null },
  ];

  const num = v => String(v).split(".").map(n => Number(n) || 0);
  const before = (a, b) => {
    const x = num(a), y = num(b);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
    return false;
  };
  // Still new in this version: the same major version, at most two minor versions ago.
  const recent = v => { const [M, m] = num(MBB.VERSION), [hM, hm] = num(v); return M === hM && m - hm <= 2; };

  // The version this phone first ran. Phones that used Miiuz before what's new existed (v1.2.0)
  // had an older version, so everything since then is new for them.
  let since = store.get("news.since", null);
  if (!since) { since = MBB.firstRun ? MBB.VERSION : "1.0.0"; store.set("news.since", since); }
  const seen = new Set(store.get("news.seen", []));
  const isNew = n => before(since, n.v) && recent(n.v) && !seen.has(n.id) && !n.used?.();
  const live = () => NEWS.filter(isNew);
  function markSeen(n) {
    seen.add(n.id);
    store.set("news.seen", [...seen]);
  }

  /* ---------- dots ---------- */
  // Tabs never re-render; links do (each screen redraws itself), so they're marked again after each change.
  function paint() {
    const now = live();
    const tabs = new Set(now.map(n => n.tab)), links = new Set(now.map(n => n.link).filter(Boolean));
    $$(".tabbar a[data-tab]").forEach(a => a.classList.toggle("is-new", tabs.has(a.dataset.tab)));
    $$("main a.is-new").forEach(a => { if (!links.has(a.getAttribute("href"))) a.classList.remove("is-new"); });
    links.forEach(h => $$(`main a[href="${h}"]`).forEach(a => a.classList.add("is-new")));
  }
  let queued = false;
  const repaint = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; paint(); }); } };
  const main = $("#main");
  if (main && "MutationObserver" in window) new MutationObserver(repaint).observe(main, { childList: true, subtree: true });

  /* ---------- "New" next to the title, the first time ---------- */
  function opened(view) {
    const n = live().find(x => x.view === view);
    if (!n) return;
    const h1 = $(`#view-${view} .view-head h1`);
    if (h1 && !h1.querySelector(".new-pill")) h1.insertAdjacentHTML("beforeend", ` <span class="new-pill">${esc(t("news.new"))}</span>`);
    markSeen(n);
    repaint();
  }

  /* ---------- after an update: one message ---------- */
  // Never on top of SOS, the full-screen card, the sign-up nudge, the update bar or another message:
  // try again a little later, then leave it for the next start.
  function announce(tries = 0) {
    const now = live();
    if (!now.length) { store.set("news.last", MBB.VERSION); return; }
    const busy = ["#sos", "#present", "#nudge", "#updbar", "#toast"].some(s => { const el = $(s); return el && !el.hidden; });
    if (busy) { if (tries < 5) setTimeout(() => announce(tries + 1), 4000); return; }
    let list;
    const names = now.map(n => t(n.name));
    try { list = new Intl.ListFormat(MBB.locale(), { type: "conjunction" }).format(names); } catch { list = names.join(", "); }
    MBB.toast(t("news.toast", { list }), { action: { label: t("news.show"), run: () => MBB.go(now[0].view) } });
    store.set("news.last", MBB.VERSION);
  }
  if (!MBB.firstRun && store.get("news.last", null) !== MBB.VERSION) setTimeout(announce, 2500);
  else store.set("news.last", MBB.VERSION);

  paint();
  MBB.news = { opened, repaint };
})();
