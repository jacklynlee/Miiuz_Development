/* Miiuz Beyond Borders — tools: currency converter, bill splitter, Malay phrasebook.
 * The driver card and the trip checklist moved to My trip (js/trip.js, #56). */
(function () {
  const MBB = window.MBB;
  const { $, $$, esc, t, L, icon } = MBB;

  const S = {
    myr: 100, homeAmt: null,
    subtotal: 120, sc: true, sst: true, people: 2,
    cat: MBB.store.get("phr.cat", "basics"),
  };

  const curName = code => {
    try { return new Intl.DisplayNames([MBB.locale(), "en"], { type: "currency" }).of(code); } catch { return code; }
  };
  const round = (n, cur) => (["JPY", "KRW", "IDR", "VND"].includes(cur) ? Math.round(n) : Math.round(n * 100) / 100);

  function fxMeta() {
    if (MBB.fx.live && MBB.fx.updated) {
      const time = new Date(MBB.fx.updated).toLocaleString(MBB.locale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      return t("tools.fxLive", { t: time });
    }
    return t("tools.fxOffline");
  }

  function render() {
    const home = MBB.state.home;
    const codes = Object.keys(MBB.C.rates);
    if (!codes.includes(home)) codes.unshift(home);
    const cat = MBB.C.phrases.find(c => c.id === S.cat) || MBB.C.phrases[0];
    const total = billTotals();

    $("#view-tools").innerHTML = `
      <div class="view-head">
        <h1>${esc(t("tools.title"))}</h1>
        <p>${esc(t("tools.lead"))}</p>
      </div>
      <div class="tools-grid">
        <section class="card tool" id="tool-fx">
          <h2>${icon("coins")}${esc(t("tools.fx"))}</h2>
          <div class="fx-row">
            <input type="number" inputmode="decimal" min="0" step="any" id="fx-myr" value="${S.myr}" aria-label="MYR">
            <span class="cur">RM</span>
          </div>
          <div class="fx-row">
            <input type="number" inputmode="decimal" min="0" step="any" id="fx-home" aria-label="${esc(home)}">
            <select id="fx-cur" aria-label="${esc(t("tools.fxHome"))}">${codes.map(c => `<option value="${c}"${c === home ? " selected" : ""}>${c}</option>`).join("")}</select>
          </div>
          <div class="fx-quick">${[10, 50, 100, 500].map(n => `<button type="button" data-rm="${n}">RM ${n}</button>`).join("")}</div>
          <div class="fx-meta">
            <p class="hint" id="fx-meta">${esc(fxMeta())} · 1 ${esc(home)} ≈ RM ${(1 / (MBB.rate(home) || 1)).toFixed(3)} · ${esc(curName(home))}</p>
            <button type="button" class="icon-btn" id="fx-refresh">${icon("refresh")}${esc(t("tools.fxRefresh"))}</button>
          </div>
        </section>

        <section class="card tool" id="tool-bill">
          <h2>${icon("bowl")}${esc(t("tools.bill"))}</h2>
          <div class="bill-grid">
            <label for="b-sub">${esc(t("tools.billSubtotal"))} (RM)<input type="number" inputmode="decimal" min="0" step="any" id="b-sub" value="${S.subtotal}"></label>
            <label for="b-people">${esc(t("tools.billPeople"))}<input type="number" inputmode="numeric" min="1" max="30" step="1" id="b-people" value="${S.people}"></label>
          </div>
          <label class="toggle" for="b-sc"><input type="checkbox" id="b-sc"${S.sc ? " checked" : ""}> ${esc(t("tools.billSC"))}</label>
          <label class="toggle" for="b-sst"><input type="checkbox" id="b-sst"${S.sst ? " checked" : ""}> ${esc(t("tools.billSST"))}</label>
          <div class="bill-out" id="b-out">${billOut(total)}</div>
          <p class="hint">${esc(t("tools.billNote"))}</p>
        </section>

        <section class="card tool wide" id="tool-phrases">
          <h2>${icon("speaker")}${esc(t("tools.phrases"))}</h2>
          <p>${esc(t("tools.phrasesLead"))}</p>
          <div class="phr-tabs" role="group">${MBB.C.phrases.map(c => `<button type="button" data-cat="${c.id}" aria-pressed="${c.id === cat.id}">${esc(L(c.title))}</button>`).join("")}</div>
          <ul class="phr-list">${cat.items.map((p, i) => `<li>
              <div><b lang="ms">${esc(p.ms)}</b><span>${esc(L(p))}</span></div>
              <div class="acts">
                <button type="button" class="icon-btn" data-speak="${i}" aria-label="${esc(t("tools.speak"))}: ${esc(p.ms)}">${icon("speaker")}</button>
                <button type="button" class="icon-btn" data-show="${i}" aria-label="${esc(t("tools.present"))}: ${esc(p.ms)}">${icon("expand")}</button>
              </div>
            </li>`).join("")}</ul>
        </section>
      </div>`;
    syncFx("myr");
    bind(cat);
  }

  /* ---------- currency ---------- */
  function syncFx(from) {
    const home = MBB.state.home, r = MBB.rate(home);
    const myrEl = $("#fx-myr"), homeEl = $("#fx-home");
    if (!myrEl || !r) return;
    if (from === "myr") {
      S.myr = parseFloat(myrEl.value) || 0;
      homeEl.value = round(S.myr * r, home);
    } else {
      const v = parseFloat(homeEl.value) || 0;
      S.myr = Math.round((v / r) * 100) / 100;
      myrEl.value = S.myr;
    }
  }

  /* ---------- bill ---------- */
  function billTotals() {
    const sub = Math.max(0, Number(S.subtotal) || 0);
    const sc = S.sc ? sub * 0.10 : 0;
    const sst = S.sst ? (sub + sc) * 0.06 : 0;
    const total = sub + sc + sst;
    const people = Math.max(1, Math.round(Number(S.people) || 1));
    return { total, each: total / people, people };
  }
  function billOut({ total, each }) {
    const home = MBB.state.home, r = MBB.rate(home) || 0;
    return `<div><span>${esc(t("tools.billTotal"))}</span><b>${MBB.rm(total)}</b><small>≈ ${esc(MBB.money(total * r, home))}</small></div>
      <div><span>${esc(t("tools.billEach"))}</span><b>${MBB.rm(each)}</b><small>≈ ${esc(MBB.money(each * r, home))}</small></div>`;
  }

  function bind(cat) {
    $("#fx-myr").addEventListener("input", () => syncFx("myr"));
    $("#fx-home").addEventListener("input", () => syncFx("home"));
    $("#fx-cur").addEventListener("change", e => MBB.setHome(e.target.value));
    $$(".fx-quick button").forEach(b => b.addEventListener("click", () => { $("#fx-myr").value = b.dataset.rm; syncFx("myr"); }));
    const refresh = async () => {
      const btn = $("#fx-refresh");
      if (btn) btn.disabled = true;
      const ok = await MBB.refreshFx(true);
      if (btn) btn.disabled = false;
      if (!ok) MBB.toast(t("tools.fxFailed"), { type: "error", action: { label: t("common.retry"), run: refresh } });
    };
    $("#fx-refresh").addEventListener("click", refresh);

    const billUpdate = () => {
      S.subtotal = $("#b-sub").value; S.people = $("#b-people").value;
      S.sc = $("#b-sc").checked; S.sst = $("#b-sst").checked;
      $("#b-out").innerHTML = billOut(billTotals());
    };
    ["#b-sub", "#b-people"].forEach(s => $(s).addEventListener("input", billUpdate));
    ["#b-sc", "#b-sst"].forEach(s => $(s).addEventListener("change", billUpdate));

    $$(".phr-tabs button").forEach(b => b.addEventListener("click", () => { S.cat = b.dataset.cat; MBB.store.set("phr.cat", S.cat); render(); $("#tool-phrases").scrollIntoView({ block: "nearest" }); }));
    $$("[data-speak]").forEach(b => b.addEventListener("click", () => {
      const p = cat.items[Number(b.dataset.speak)];
      if (!MBB.speak(p.ms)) MBB.toast(t("tools.noVoice"), { type: "error" });
    }));
    $$("[data-show]").forEach(b => b.addEventListener("click", () => {
      const p = cat.items[Number(b.dataset.show)];
      MBB.present({ big: p.ms, sub: L(p) === p.en ? p.en : `${L(p)} · ${p.en}` });
    }));
  }

  MBB.tools = {
    init() {
      MBB.on("lang", render);
      MBB.on("fx", render);
      render();
    },
  };
})();
