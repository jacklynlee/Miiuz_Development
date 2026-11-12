/* Miiuz Beyond Borders — Explore tab (#49): where to go, what to eat, what to bring home, when to go.
 * Cards open the place page or the Guide topic. Our Pick! (#50) food places follow the food to try.
 * Later: stays (#4), car tours (#10). */
(function () {
  const MBB = window.MBB;
  const { $, esc, t, L, icon } = MBB;

  function render() {
    const C = MBB.C;
    const topic = id => C.guide.find(g => g.id === id);
    const dishes = topic("food")?.dishes || [];
    const when = ["weather", "festivals"].map(topic).filter(Boolean);

    $("#view-explore").innerHTML = `
      <div class="view-head">
        <p class="eyebrow">${esc(L(C.name))}</p>
        <h1>${esc(t("explore.title"))}</h1>
        <p>${esc(t("explore.pageLead"))}</p>
      </div>
      <a class="search-launch" href="#search" data-search>${icon("search")}<span>${esc(t("search.ph"))}</span></a>

      <section class="explore">
        <div class="section-title"><h2>${esc(t("explore.dest"))}</h2><a href="#search" data-search>${esc(t("explore.all"))}</a></div>
        <p class="hint">${esc(t("explore.lead"))}</p>
        <div class="mymap-wrap">${MBB.maps.overview()}</div>
        <div class="strip">${C.destinations.map(MBB.place.destCard).join("")}</div>
      </section>

      <section>
        <div class="section-title"><h2>${esc(t("home.food"))}</h2><a href="#guide-food">${esc(t("home.more"))}</a></div>
        <div class="strip">${dishes.map((d, i) => `<a class="pic-card" href="#guide-food" data-scroll="dish-${i}">
          ${MBB.media.html(`dish:${i}`, { alt: "", ic: "bowl" })}<span><b>${esc(d.ms)}</b><small>${esc(L(d))}</small></span></a>`).join("")}</div>
      </section>

      <div id="x-picks">${MBB.picks.sectionHtml()}</div>

      <section>
        <div class="section-title"><h2>${esc(t("home.souvenirs"))}</h2><a href="#guide-shopping">${esc(t("home.more"))}</a></div>
        <div class="strip">${C.souvenirs.map(sv => `<a class="pic-card" href="#guide-shopping" data-scroll="souv-${sv.id}">
          ${MBB.media.html(`souv:${sv.id}`, { alt: "", ic: "gift" })}<span><b>${esc(L(sv.name))}</b><small>${esc(L(sv.desc))}</small></span></a>`).join("")}</div>
      </section>

      <section>
        <div class="section-title"><h2>${esc(t("explore.when"))}</h2></div>
        <div class="topics">${when.map(MBB.guide.topicCard).join("")}</div>
      </section>`;
  }

  // Our Pick! listings arrived or changed: update their section only.
  MBB.on("picks", () => { const el = $("#x-picks"); if (el && !$("#view-explore").hidden) el.innerHTML = MBB.picks.sectionHtml(); });

  MBB.explore = { render };
})();
