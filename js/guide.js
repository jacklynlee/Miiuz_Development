/* Miiuz Beyond Borders — country guide: topic list and topic pages. */
(function () {
  const MBB = window.MBB;
  const { $, esc, t, L, icon } = MBB;
  const view = () => $("#view-guide");

  const checkedLabel = () => {
    const [y, m] = MBB.C.checked.split("-").map(Number);
    try { return new Date(y, m - 1, 1).toLocaleDateString(MBB.locale(), { month: "long", year: "numeric" }); } catch { return MBB.C.checked; }
  };

  const topicCard = g => `<a class="topic" href="#guide-${g.id}">
      <span class="badge-ic">${icon(g.icon)}</span>
      <b>${esc(L(g.title))}</b>
      <small>${esc(L(g.lead))}</small>
    </a>`;

  function renderList() {
    view().innerHTML = `
      <div class="view-head">
        <p class="eyebrow">${esc(L(MBB.C.name))}</p>
        <h1>${esc(t("guide.title"))}</h1>
        <p>${esc(t("guide.lead"))}</p>
      </div>
      <div class="topics">${MBB.C.guide.map(topicCard).join("")}</div>`;
  }

  function renderTopic(id) {
    const g = MBB.C.guide.find(x => x.id === id);
    if (!g) {
      view().innerHTML = `<a class="back" href="#guide">${icon("back")}${esc(t("guide.back"))}</a><p>${esc(t("guide.notFound"))}</p>`;
      return;
    }
    const city = MBB.state.city;
    // City-specific sections: the traveller's own city first and marked.
    const sections = [...g.sections].sort((a, b) => (b.city === city) - (a.city === city));
    const facts = (g.facts || []).map(f => `<div class="fact"><span>${esc(L(f.k))}</span><b>${esc(L(f.v))}</b></div>`).join("");
    const dishes = g.dishes ? `<section class="card g-sec">
        <h2>${esc(t("guide.dishes"))}</h2>
        <dl class="dishes">${g.dishes.map(d => `<div class="dish"><dt>${esc(d.ms)}</dt><dd>${esc(L(d))}</dd></div>`).join("")}</dl>
      </section>` : "";
    const secs = sections.map(s => {
      const mine = s.city && s.city === city;
      return `<section class="card g-sec${mine ? " mine" : ""}">
        <h2>${esc(L(s.h))}${mine ? ` <span class="pill teal">${esc(t("guide.yourCity"))}</span>` : ""}</h2>
        <ul>${s.items.map(it => `<li>${esc(L(it))}</li>`).join("")}</ul>
      </section>`;
    }).join("");
    const shown = (g.links || []).filter(l => !l.only || l.only.includes(MBB.state.lang));
    const links = shown.length ? `<div>
        <div class="section-title"><h2>${esc(t("guide.links"))}</h2></div>
        <div class="links">${shown.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(L(l.label))}${icon("external")}</a>`).join("")}</div>
      </div>` : "";

    view().innerHTML = `
      <a class="back" href="#guide">${icon("back")}${esc(t("guide.back"))}</a>
      <div class="topic-head">
        <span class="badge-ic">${icon(g.icon)}</span>
        <div><h1>${esc(L(g.title))}</h1><p>${esc(L(g.lead))}</p></div>
      </div>
      ${facts ? `<div class="facts">${facts}</div>` : ""}
      ${dishes}
      <div class="g-sections">${secs}</div>
      ${links}
      <p class="checked-note">${esc(t("guide.checked", { d: checkedLabel() }))}</p>
      <div class="actions"><button type="button" class="btn btn-ai" id="g-ask">${icon("spark")}${esc(t("guide.ask"))}</button></div>`;

    $("#g-ask").addEventListener("click", () => MBB.chat.prefill(t("guide.askPrompt", { t: L(g.title) })));
  }

  MBB.guide = {
    render(sub) { sub ? renderTopic(sub) : renderList(); },
    topicCard,
    checkedLabel,
  };
})();
