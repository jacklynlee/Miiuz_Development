/* Miiuz Beyond Borders — membership.
 * Guests can use everything for free. Members sign in with a 6-digit code sent by email
 * (no password), earn points (+10 for joining, +10 for every friend who joins with their
 * invite link), move up tiers by points ever earned (Basic → Silver → Gold → Platinum),
 * and see member-only offers, goodies and news. Accounts live in Supabase and the
 * database awards points itself (supabase/schema.sql), so the app can't be tricked
 * into adding points. Guests get a gentle invitation after 5 minutes of use. */
(function () {
  const MBB = window.MBB;
  const { $, esc, t, L, icon } = MBB;
  const SDK = "vendor/supabase-js@2.117.3/supabase.js"; // our own copy (npm run vendor): jsDelivr is unreliable in China
  const TIERS = ["basic", "silver", "gold", "platinum"];
  const NUDGE_FIRST = 5 * 60e3, NUDGE_GAP = 10 * 60e3, NUDGE_MAX_GAP = 60 * 60e3;
  const RESEND_SECONDS = 60;
  // Nationality list and the countries shown first: shared with the home-country picker (js/country.js).
  const { COUNTRIES, COMMON } = MBB.origin;
  const DETAILS = "nationality, phone, sms_opt_in, emergency_name, emergency_relation, emergency_phone";
  const fromLink = /access_token=|error_description=/.test(location.hash); // came back from an email link

  const M = {
    status: "loading", // loading | off (membership not connected) | guest | member
    sb: null, user: null, profile: null, stat: null, ledger: [], offers: [], offerCount: null,
    tiers: [{ tier: "basic", min_points: 0 }, { tier: "silver", min_points: 1000 }, { tier: "gold", min_points: 5000 }, { tier: "platinum", min_points: 10000 }],
    stage: "form", mode: "join", email: "", busy: false, error: "", resendAt: 0, setupError: false, editing: false,
  };

  const num = n => { try { return new Intl.NumberFormat(MBB.locale()).format(n); } catch { return String(n); } };
  const date = d => { try { return new Date(d).toLocaleDateString(MBB.locale(), { year: "numeric", month: "short", day: "numeric" }); } catch { return ""; } };
  const tierName = k => t(`tier.${k}`);
  const refCode = () => MBB.store.get("ref", "");
  const inviteUrl = () => `${location.origin}/?ref=${encodeURIComponent(M.profile?.referral_code || "")}`;
  function country(code) {
    try { return new Intl.DisplayNames([MBB.locale(), "en"], { type: "region" }).of(code) || code; } catch { return code; }
  }
  // "+60 12-345 6789" → "+60123456789"; null if it isn't an international number.
  const phone = raw => { const v = String(raw || "").replace(/[\s().-]/g, ""); return v ? (/^\+\d{7,15}$/.test(v) ? v : null) : ""; };
  // Details typed at sign-up wait here (this tab only) until the email code is verified.
  const pending = {
    get() { try { return JSON.parse(sessionStorage.getItem("mbb.pending") || "null"); } catch { return null; } },
    set(v) { try { v ? sessionStorage.setItem("mbb.pending", JSON.stringify(v)) : sessionStorage.removeItem("mbb.pending"); } catch { /* private mode */ } },
  };

  /* ---------- set-up ---------- */
  function captureRef() {
    try {
      const u = new URL(location.href);
      if (!u.searchParams.has("ref")) return;
      const code = (u.searchParams.get("ref") || "").trim().toUpperCase();
      if (/^[A-Z0-9]{4,12}$/.test(code)) MBB.store.set("ref", code);
      u.searchParams.delete("ref");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch { /* not allowed here */ }
  }
  async function loadConfig() {
    const j = await MBB.config();
    return j?.supabaseUrl && j?.supabaseKey ? j : null;
  }
  const loadScript = src => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = resolve; s.onerror = reject;
    document.head.append(s);
  });

  async function init() {
    captureRef();
    startUsage();
    MBB.on("lang", () => { renderHeader(); if (location.hash === "#member") render(); });
    renderHeader();

    const cfg = await loadConfig();
    if (!cfg) return setStatus("off");
    try { await loadScript(SDK); } catch { return setStatus("off"); }
    if (!window.supabase?.createClient) return setStatus("off");
    M.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "mbb.auth" },
    });
    // Don't call Supabase inside this callback directly (it can deadlock); hop out first.
    M.sb.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      setTimeout(() => onSession(session, event === "SIGNED_IN"), 0);
    });
    const { data } = await M.sb.auth.getSession();
    await onSession(data.session, false);
    loadPublic();
    if (fromLink) {
      const err = new URLSearchParams(location.hash.slice(1)).get("error_description");
      if (err) { M.error = t("member.badCode"); MBB.go("member"); }
    }
  }

  function setStatus(s, redraw = true) {
    M.status = s;
    if (redraw) refresh();
  }
  function refresh() {
    renderHeader();
    if (location.hash === "#member") render();
    MBB.emit("member");
  }

  async function onSession(session, fresh) {
    const user = session?.user || null;
    const same = (user?.id || null) === (M.user?.id || null);
    M.user = user;
    if (!user) {
      Object.assign(M, { profile: null, stat: null, ledger: [], offers: [] });
      return setStatus("guest");
    }
    if (same && M.status === "member" && !fresh) return;
    await savePending();
    await loadMember();
    M.stage = "form"; M.error = "";
    setStatus("member");
    if (fresh) {
      const isNew = M.profile?.created_at && Date.now() - new Date(M.profile.created_at) < 15 * 60e3;
      MBB.toast(t(isNew ? "member.welcome" : "member.welcomeBack"));
      if (location.hash !== "#member") MBB.go("member");
    } else if (fromLink) {
      MBB.go("member");
    }
  }

  async function loadMember() {
    const [p, s, l, o] = await Promise.all([
      M.sb.from("profiles").select(`referral_code, display_name, marketing_opt_in, created_at, ${DETAILS}`).eq("id", M.user.id).maybeSingle(),
      M.sb.rpc("my_status"),
      M.sb.from("points_ledger").select("points, reason, created_at").order("created_at", { ascending: false }).limit(30),
      M.sb.from("member_offers").select("id, kind, min_tier, title, body, code, link, starts_at, ends_at").order("starts_at", { ascending: false }).limit(30),
    ]);
    M.setupError = Boolean(p.error || s.error);
    M.profile = p.data || null;
    M.stat = (Array.isArray(s.data) ? s.data[0] : s.data) || null;
    M.ledger = l.data || [];
    M.offers = o.data || [];
    celebrateTierUp();
  }
  async function savePending() {
    const p = pending.get();
    if (!p || !M.user) return;
    const { error } = await M.sb.from("profiles").update(p).eq("id", M.user.id);
    if (!error) pending.set(null);
  }
  async function loadPublic() {
    const [c, tr] = await Promise.all([
      M.sb.rpc("live_offer_count"),
      M.sb.from("member_tiers").select("tier, min_points").order("min_points"),
    ]);
    if (typeof c.data === "number") M.offerCount = c.data;
    if (Array.isArray(tr.data) && tr.data.length) M.tiers = tr.data;
    refresh();
  }
  function celebrateTierUp() {
    const tier = M.stat?.tier;
    if (!tier) return;
    const key = `tier.${M.user.id}`, seen = MBB.store.get(key, null);
    MBB.store.set(key, tier);
    if (seen && TIERS.indexOf(tier) > TIERS.indexOf(seen)) setTimeout(() => MBB.toast(t("member.tierUp", { t: tierName(tier) })), 600);
  }

  /* ---------- sign-in with an emailed code ---------- */
  function authError(e) {
    const code = e?.code || "", msg = e?.message || "";
    if (e?.status === 429 || /rate_limit|over_/.test(code) || /rate limit|too many/i.test(msg)) return t("member.tooMany");
    if (/otp|token|expired|invalid/i.test(code + " " + msg)) return t("member.badCode");
    return t("member.failed");
  }
  // Busy state and errors are shown in place, so nothing the traveller typed is lost.
  function setBusy(b) {
    M.busy = b;
    document.querySelectorAll("#view-member form [type=submit]").forEach(btn => { btn.disabled = b; });
  }
  function showError(msg) {
    M.error = msg;
    const el = $("#view-member .m-error[role=alert]");
    if (!el) return render();
    el.textContent = msg; el.hidden = !msg;
  }
  function fail(msg) { setBusy(false); showError(msg); }

  // The optional details from a form, checked; returns an error message or the values.
  function readDetails(f) {
    const ph = phone(f.elements.phone.value), eph = phone(f.elements.emergency_phone.value);
    if (ph === null || eph === null) return { error: t("member.badPhone") };
    const nat = f.elements.nationality.value;
    if (!/^[A-Z]{2}$/.test(nat)) return { error: t("member.needNationality") };
    return {
      nationality: nat, phone: ph || null, sms_opt_in: Boolean(ph && f.elements.sms.checked),
      emergency_name: f.elements.emergency_name.value.trim().slice(0, 80) || null,
      emergency_relation: f.elements.emergency_relation.value.trim().slice(0, 40) || null,
      emergency_phone: eph || null,
    };
  }

  async function sendCode(form) {
    const email = form.elements.email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(t("member.badEmail"));
    if (M.status !== "guest") return fail(t("member.off"));
    const joining = M.mode === "join";
    let details = null;
    if (joining) {
      details = readDetails(form);
      if (details.error) return fail(details.error);
    }
    setBusy(true); showError("");
    const { error } = await M.sb.auth.signInWithOtp({
      email,
      options: joining ? {
        shouldCreateUser: true,
        emailRedirectTo: location.origin + location.pathname,
        data: { name: form.elements.name.value.trim().slice(0, 60), ref: refCode(), marketing: form.elements.marketing.checked, lang: MBB.state.lang, nationality: details.nationality },
      } : { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
    });
    if (error) {
      if (!joining && /signups? not allowed|otp_disabled|user not found/i.test(`${error.code} ${error.message}`)) return fail(t("member.noAccount"));
      return fail(authError(error));
    }
    if (joining) pending.set(details);
    Object.assign(M, { email, stage: "code", busy: false, error: "", resendAt: Date.now() + RESEND_SECONDS * 1000 });
    render();
    $("#m-code")?.focus();
  }

  async function verify(raw) {
    const token = String(raw || "").replace(/\D/g, "");
    if (token.length < 6) return fail(t("member.badCode"));
    setBusy(true); showError("");
    let { error } = await M.sb.auth.verifyOtp({ email: M.email, token, type: "email" });
    if (error) ({ error } = await M.sb.auth.verifyOtp({ email: M.email, token, type: "signup" }));
    if (error) return fail(authError(error));
    M.busy = false; // onAuthStateChange (SIGNED_IN) loads the member and re-renders
  }

  async function resend() {
    if (Date.now() < M.resendAt || M.busy) return;
    setBusy(true);
    const { error } = await M.sb.auth.signInWithOtp({ email: M.email, options: { shouldCreateUser: M.mode === "join", emailRedirectTo: location.origin + location.pathname } });
    if (error) return fail(authError(error));
    Object.assign(M, { busy: false, error: "", resendAt: Date.now() + RESEND_SECONDS * 1000 });
    render();
    MBB.toast(t("member.resent"));
  }

  /* ---------- rendering ---------- */
  function renderHeader() {
    const b = $("#member-btn");
    if (!b) return;
    if (M.status === "member" && M.stat) {
      b.className = `member-btn on tier-${M.stat.tier}`;
      b.innerHTML = `${icon("star")}<span class="mono">${num(M.stat.balance)}</span>`;
      b.setAttribute("aria-label", `${tierName(M.stat.tier)} · ${num(M.stat.balance)} ${t("member.points")}`);
    } else {
      b.className = "member-btn";
      b.innerHTML = `${icon("user")}${M.status === "guest" ? '<span class="dot" aria-hidden="true"></span>' : ""}`;
      b.setAttribute("aria-label", t("member.join"));
    }
  }

  function ladder(current) {
    return `<ol class="ladder">${M.tiers.map(x => `
      <li class="tier-${x.tier}${x.tier === current ? " here" : ""}">
        <span class="tier-dot"></span>
        <b>${esc(tierName(x.tier))}</b>
        <small class="mono">${x.min_points ? num(x.min_points) : "0"}</small>
      </li>`).join("")}</ol>
      <p class="hint">${esc(t("member.tierNote"))}</p>`;
  }

  // Nationality, phone and emergency contact fields, shared by the join form and "Your details".
  function detailFields(p, id) {
    const names = COUNTRIES.map(c => [c, country(c)]);
    let coll;
    try { coll = new Intl.Collator(MBB.locale()); } catch { coll = new Intl.Collator("en"); }
    names.sort((a, b) => coll.compare(a[1], b[1]));
    const opt = ([c, n]) => `<option value="${c}"${c === p.nationality ? " selected" : ""}>${esc(n)}</option>`;
    return `
      <label for="m-${id}-nat"><span>${esc(t("member.nationality"))} <b class="req" aria-hidden="true">*</b></span>
        <select id="m-${id}-nat" name="nationality" required autocomplete="country">
          <option value="">${esc(t("member.natPick"))}</option>
          <optgroup label="${esc(t("member.natPopular"))}">${COMMON.map(c => opt([c, country(c)])).join("")}</optgroup>
          <optgroup label="${esc(t("member.natAll"))}">${names.map(opt).join("")}</optgroup>
        </select>
      </label>
      <label for="m-${id}-phone">${esc(t("member.phone"))}
        <input id="m-${id}-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="24" placeholder="+" value="${esc(p.phone || "")}">
        <small class="hint">${esc(t("member.phoneHint"))}</small>
      </label>
      <label class="toggle m-sms" for="m-${id}-sms"${p.phone ? "" : " hidden"}><input type="checkbox" id="m-${id}-sms" name="sms"${p.sms_opt_in ? " checked" : ""}> <span>${esc(t("member.sms"))}</span></label>
      <fieldset class="m-emergency">
        <legend>${esc(t("member.emergency"))}</legend>
        <p class="hint">${esc(t("member.emergencyHint"))}</p>
        <label for="m-${id}-en">${esc(t("member.emName"))}<input id="m-${id}-en" name="emergency_name" maxlength="80" autocomplete="off" value="${esc(p.emergency_name || "")}"></label>
        <label for="m-${id}-er">${esc(t("member.emRelation"))}<input id="m-${id}-er" name="emergency_relation" maxlength="40" autocomplete="off" value="${esc(p.emergency_relation || "")}"></label>
        <label for="m-${id}-ep">${esc(t("member.emPhone"))}<input id="m-${id}-ep" name="emergency_phone" type="tel" inputmode="tel" maxlength="24" placeholder="+" autocomplete="off" value="${esc(p.emergency_phone || "")}"></label>
      </fieldset>`;
  }
  // Offer the WhatsApp/SMS opt-in only once there's a phone number.
  function bindDetailFields(root) {
    root.querySelectorAll("input[name=phone]").forEach(inp => inp.addEventListener("input", () => {
      const box = inp.form.querySelector(".m-sms");
      box.hidden = !inp.value.trim();
      if (box.hidden) box.querySelector("input").checked = false;
    }));
  }

  function renderJoin(view) {
    const invited = refCode();
    const offers = M.offerCount ? `<small class="em">${esc(t("home.member.offers", { n: M.offerCount }))}</small>` : "";
    const form = M.stage === "code" ? `
      <form id="m-verify" class="m-form" novalidate>
        <p>${esc(t("member.sent", { e: M.email }))}</p>
        <label for="m-code">${esc(t("member.code"))}
          <input id="m-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" class="otp" required>
        </label>
        <button type="submit" class="btn btn-main"${M.busy ? " disabled" : ""}>${esc(t("member.verify"))}</button>
        <div class="m-links">
          <button type="button" class="linkish" id="m-other">${esc(t("member.otherEmail"))}</button>
          <button type="button" class="linkish" id="m-resend"></button>
        </div>
      </form>` : M.mode === "signin" ? `
      <form id="m-join" class="m-form" novalidate>
        <p>${esc(t("member.signinLead"))}</p>
        <label for="m-email">${esc(t("member.email"))}<input id="m-email" name="email" type="email" autocomplete="email" inputmode="email" required value="${esc(M.email)}"></label>
        <button type="submit" class="btn btn-main"${M.busy ? " disabled" : ""}>${esc(t("member.sendSignin"))}</button>
      </form>` : `
      <form id="m-join" class="m-form" novalidate>
        <label for="m-name">${esc(t("member.name"))}<input id="m-name" name="name" autocomplete="name" maxlength="60"></label>
        <label for="m-email">${esc(t("member.email"))}<input id="m-email" name="email" type="email" autocomplete="email" inputmode="email" required value="${esc(M.email)}"></label>
        ${detailFields({}, "j")}
        <label class="toggle" for="m-marketing"><input type="checkbox" id="m-marketing" name="marketing"> <span>${esc(t("member.marketing"))}</span></label>
        <button type="submit" class="btn btn-main"${M.busy ? " disabled" : ""}>${icon("gift")}${esc(t("member.send"))}</button>
        <p class="hint">${esc(t("member.consent"))}</p>
        <p class="hint">${esc(t("member.privacy"))}</p>
      </form>`;
    const tabs = M.stage === "code" ? "" : `<div class="m-tabs" role="tablist">
        <button type="button" role="tab" data-mode="join" aria-selected="${M.mode === "join"}">${esc(t("member.tabJoin"))}</button>
        <button type="button" role="tab" data-mode="signin" aria-selected="${M.mode === "signin"}">${esc(t("member.tabSignIn"))}</button>
      </div>`;

    view.innerHTML = `
      <div class="view-head">
        <p class="eyebrow">Miiuz BB</p>
        <h1>${esc(t("member.title"))}</h1>
        <p>${esc(t("member.lead"))}</p>
      </div>
      <div class="m-grid">
        <section class="card m-perks">
          <ul class="perk-list">
            <li><span class="badge-ic hot">${icon("gift")}</span><div><b>${esc(t("member.perk.signup"))}</b></div></li>
            <li><span class="badge-ic">${icon("users")}</span><div><b>${esc(t("member.perk.invite"))}</b></div></li>
            <li><span class="badge-ic warm">${icon("tag")}</span><div><b>${esc(t("member.perk.offers"))}</b>${offers}</div></li>
            <li><span class="badge-ic">${icon("news")}</span><div><b>${esc(t("member.perk.news"))}</b></div></li>
          </ul>
          <h2 class="m-sub">${esc(t("member.tiers"))}</h2>
          ${ladder("")}
        </section>
        <section class="card m-join">
          ${invited ? `<p class="m-invited">${icon("users")}<span>${esc(t("member.invited"))}</span></p>` : ""}
          ${M.status === "off" ? `<p class="m-off">${esc(t("member.off"))}</p>` : ""}
          ${tabs}
          ${form}
          <p class="m-error" role="alert"${M.error ? "" : " hidden"}>${esc(M.error)}</p>
        </section>
      </div>`;

    $("#m-join")?.addEventListener("submit", e => { e.preventDefault(); sendCode(e.currentTarget); });
    $("#m-verify")?.addEventListener("submit", e => { e.preventDefault(); verify(e.currentTarget.elements.code.value); });
    $("#m-other")?.addEventListener("click", () => { M.stage = "form"; M.error = ""; render(); });
    view.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => { M.mode = b.dataset.mode; M.error = ""; render(); }));
    bindDetailFields(view);
    const rs = $("#m-resend");
    if (rs) {
      const tick = () => {
        if (!document.body.contains(rs)) return;
        const left = Math.ceil((M.resendAt - Date.now()) / 1000);
        rs.disabled = left > 0 || M.busy;
        rs.textContent = left > 0 ? t("member.resendIn", { s: left }) : t("member.resend");
        if (left > 0) setTimeout(tick, 1000);
      };
      tick();
      rs.addEventListener("click", resend);
    }
  }

  function renderMember(view) {
    const s = M.stat || { balance: 0, lifetime: 0, tier: "basic", next_tier: "silver", next_at: 1000 };
    const p = M.profile || {};
    const cur = M.tiers.find(x => x.tier === s.tier)?.min_points || 0;
    const pct = s.next_at ? Math.max(2, Math.min(100, Math.round(((s.lifetime - cur) / (s.next_at - cur)) * 100))) : 100;
    const friends = M.ledger.filter(x => x.reason === "referral").length;
    const name = p.display_name || M.user.email;

    const offers = M.offers.length ? M.offers.map(o => `
      <article class="card offer">
        <div class="offer-tags"><span class="pill ${o.kind === "news" ? "" : "warn"}">${esc(t(`member.kind.${o.kind}`))}</span>${o.min_tier && o.min_tier !== "basic" ? `<span class="pill tier-pill tier-${o.min_tier}">${esc(tierName(o.min_tier))}</span>` : ""}</div>
        <h3>${esc(L(o.title))}</h3>
        ${L(o.body) ? `<p>${esc(L(o.body))}</p>` : ""}
        <div class="offer-foot">
          ${o.code ? `<span class="offer-code"><small>${esc(t("member.codeLabel"))}</small><b class="mono">${esc(o.code)}</b><button type="button" class="icon-btn" data-copy-code="${esc(o.code)}" aria-label="${esc(t("sos.copy"))}">${icon("copy")}</button></span>` : ""}
          ${o.link && /^https?:\/\//.test(o.link) ? `<a class="btn btn-ghost btn-sm" href="${esc(o.link)}" target="_blank" rel="noopener">${esc(t("member.open"))}${icon("external")}</a>` : ""}
          ${o.ends_at ? `<small class="hint">${esc(t("member.until", { d: date(o.ends_at) }))}</small>` : ""}
        </div>
      </article>`).join("") : `<p class="hint">${esc(t("member.noOffers"))}</p>`;

    const history = M.ledger.length ? `<ul class="history">${M.ledger.map(x => `
      <li><span>${esc(t(`member.r.${x.reason}`))}<small>${esc(date(x.created_at))}</small></span><b class="mono ${x.points < 0 ? "neg" : ""}">${x.points > 0 ? "+" : ""}${num(x.points)}</b></li>`).join("")}</ul>` : `<p class="hint">—</p>`;

    const details = M.editing ? `
        <form id="m-details" class="m-form" novalidate>
          <label for="m-dname">${esc(t("member.name"))}<input id="m-dname" name="name" autocomplete="name" maxlength="60" value="${esc(p.display_name || "")}"></label>
          ${detailFields(p, "e")}
          <div class="actions"><button type="submit" class="btn btn-main btn-sm">${esc(t("member.save"))}</button><button type="button" class="btn btn-ghost btn-sm" id="m-cancel">${esc(t("member.cancel"))}</button></div>
          <p class="m-error" role="alert" hidden></p>
        </form>` : `
        <dl class="m-dl">
          <div><dt>${esc(t("member.emName"))}</dt><dd>${esc(p.display_name || t("member.notSet"))}</dd></div>
          <div><dt>${esc(t("member.nationality"))}</dt><dd>${esc(p.nationality ? country(p.nationality) : t("member.notSet"))}</dd></div>
          <div><dt>${esc(t("member.phoneLabel"))}</dt><dd>${esc(p.phone || t("member.notSet"))}</dd></div>
          <div><dt>${esc(t("member.emergencyLabel"))}</dt><dd>${p.emergency_phone ? esc([p.emergency_name, p.emergency_relation && `(${p.emergency_relation})`, p.emergency_phone].filter(Boolean).join(" ")) : esc(t("member.notSet"))}</dd></div>
        </dl>
        <div class="actions"><button type="button" class="btn btn-ghost btn-sm" id="m-edit">${esc(t("member.edit"))}</button></div>`;

    view.innerHTML = `
      ${M.setupError ? `<p class="m-error">${esc(t("member.setupMissing"))}</p>` : ""}
      ${M.profile && !p.nationality && !M.editing ? `<button type="button" class="card m-complete" id="m-complete">${icon("user")}<span>${esc(t("member.complete"))}</span>${icon("next", "next")}</button>` : ""}
      <section class="mcard tier-${s.tier}">
        <div class="mcard-top"><span class="tier-badge">${icon("star")}${esc(tierName(s.tier))}</span><span class="mcard-brand">Miiuz BB</span></div>
        <div class="mcard-name">${esc(name)}</div>
        <div class="mcard-points"><b class="mono">${num(s.balance)}</b><span>${esc(t("member.points"))}</span></div>
        <div class="mcard-progress">
          <div class="bar"><i style="width:${pct}%"></i></div>
          <small>${s.next_tier ? esc(t("member.toNext", { n: num(s.next_at - s.lifetime), t: tierName(s.next_tier) })) : esc(t("member.topTier"))}</small>
        </div>
        <div class="mcard-meta">${esc(t("member.lifetime", { n: num(s.lifetime) }))}${p.created_at ? ` · ${esc(t("member.since", { d: date(p.created_at) }))}` : ""}</div>
      </section>

      <div class="m-grid">
        <section class="card m-invite">
          <h2>${icon("users")}${esc(t("member.invite"))}</h2>
          <p>${esc(t("member.inviteLead"))}</p>
          <div class="invite-link"><span class="mono" id="m-link">${esc(inviteUrl())}</span></div>
          <div class="actions">
            <button type="button" class="btn btn-main btn-sm" id="m-copy">${icon("copy")}${esc(t("member.copyLink"))}</button>
            <button type="button" class="btn btn-ghost btn-sm" id="m-share">${icon("send")}${esc(t("member.share"))}</button>
          </div>
          <p class="hint">${esc(t("member.friends", { n: num(friends) }))} · ${esc(t("member.yourCode"))} <b class="mono">${esc(p.referral_code || "")}</b></p>
        </section>
        <section class="card m-tiers">
          <h2>${icon("star")}${esc(t("member.tiers"))}</h2>
          ${ladder(s.tier)}
          <p class="hint">${esc(t("member.redeemSoon"))}</p>
        </section>
      </div>

      <section>
        <div class="section-title"><h2>${esc(t("member.offers"))}</h2></div>
        <div class="offers">${offers}</div>
      </section>

      <div class="m-grid">
        <section class="card">
          <h2 class="m-sub">${esc(t("member.history"))}</h2>
          ${history}
        </section>
        <section class="card m-details" id="m-details-card">
          <h2 class="m-sub">${esc(t("member.detailsTitle"))}</h2>
          ${details}
          <p class="hint">${esc(t("member.privacy"))}</p>
        </section>
        <section class="card m-settings">
          <h2 class="m-sub">${esc(t("member.settingsTitle"))}</h2>
          <p class="hint">${esc(M.user.email)}</p>
          <label class="toggle" for="m-optin"><input type="checkbox" id="m-optin"${p.marketing_opt_in ? " checked" : ""}> <span>${esc(t("member.marketing"))}</span></label>
          <div class="actions"><button type="button" class="btn btn-ghost btn-sm" id="m-signout">${esc(t("member.signOut"))}</button></div>
        </section>
      </div>`;

    $("#m-copy").addEventListener("click", () => MBB.copy(inviteUrl()).then(ok => MBB.toast(ok ? t("member.linkCopied") : t("common.copyFail"))));
    $("#m-share").addEventListener("click", async () => {
      const data = { title: "Miiuz BB", text: t("member.shareText"), url: inviteUrl() };
      try { if (navigator.share && !MBB.install.wechat) { await navigator.share(data); return; } } catch (e) { if (e?.name === "AbortError") return; }
      MBB.copy(`${data.text} ${data.url}`).then(ok => MBB.toast(ok ? t("member.linkCopied") : t("common.copyFail")));
    });
    view.querySelectorAll("[data-copy-code]").forEach(b => b.addEventListener("click", () => MBB.copy(b.dataset.copyCode).then(ok => MBB.toast(ok ? t("sos.copied", { x: b.dataset.copyCode }) : t("common.copyFail")))));
    $("#m-optin").addEventListener("change", async e => {
      const on = e.target.checked;
      const { error } = await M.sb.from("profiles").update({ marketing_opt_in: on }).eq("id", M.user.id);
      if (error) { e.target.checked = !on; MBB.toast(t("member.failed")); return; }
      if (M.profile) M.profile.marketing_opt_in = on;
      MBB.toast(t("common.saved"));
    });
    $("#m-signout").addEventListener("click", async () => { await M.sb.auth.signOut(); MBB.go("home"); });
    const edit = () => { M.editing = true; render(); $("#m-details-card").scrollIntoView({ block: "start" }); };
    $("#m-edit")?.addEventListener("click", edit);
    $("#m-complete")?.addEventListener("click", edit);
    $("#m-cancel")?.addEventListener("click", () => { M.editing = false; render(); });
    bindDetailFields(view);
    $("#m-details")?.addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.currentTarget, err = f.querySelector(".m-error");
      const d = readDetails(f);
      if (d.error) { err.textContent = d.error; err.hidden = false; return; }
      d.display_name = f.elements.name.value.trim().slice(0, 60) || null;
      f.querySelector("[type=submit]").disabled = true;
      const { error } = await M.sb.from("profiles").update(d).eq("id", M.user.id);
      if (error) { err.textContent = t("member.failed"); err.hidden = false; f.querySelector("[type=submit]").disabled = false; return; }
      Object.assign(M.profile, d);
      M.editing = false;
      refresh();
      MBB.toast(t("common.saved"));
    });
  }

  function render() {
    const view = $("#view-member");
    if (!view) return;
    if (M.status === "loading") { view.innerHTML = `<p class="hint">…</p>`; return; }
    if (M.status === "member") renderMember(view); else renderJoin(view);
  }

  // Card at the top of Home: an invitation for guests, a status line for members.
  function homeCard() {
    if (M.status === "off") return ""; // not connected yet: don't invite people to something they can't join
    if (M.status === "member" && M.stat) {
      const name = M.profile?.display_name;
      return `<a class="card mhome tier-${M.stat.tier}" href="#member">
        <span class="badge-ic">${icon("star")}</span>
        <span><b>${esc(name ? t("member.hi", { n: name }) : t("member.hiAnon"))}</b>
          <small>${esc(tierName(M.stat.tier))} · ${esc(t("home.member.yours", { p: num(M.stat.balance) }))}${M.offers.length ? ` · ${esc(t("home.member.offers", { n: M.offers.length }))}` : ""}</small></span>
        ${icon("next", "next")}
      </a>`;
    }
    return `<a class="card mhome join" href="#member">
      <span class="badge-ic hot">${icon("gift")}</span>
      <span><b>${esc(t("home.member.title"))}</b>
        <small>${esc(t("home.member.perks"))}</small>
        ${refCode() ? `<small class="em">${esc(t("member.invited"))}</small>` : M.offerCount ? `<small class="em">${esc(t("home.member.offers", { n: M.offerCount }))}</small>` : ""}</span>
      <span class="btn btn-main btn-sm">${esc(t("member.join"))}</span>
    </a>`;
  }

  /* ---------- sign-up nudges for guests ---------- */
  function startUsage() {
    let last = Date.now();
    document.addEventListener("visibilitychange", () => { last = Date.now(); });
    setInterval(() => {
      const now = Date.now(), dt = Math.min(now - last, 20000);
      last = now;
      if (document.visibilityState !== "visible") return;
      const used = MBB.store.get("usage.ms", 0) + dt;
      MBB.store.set("usage.ms", used);
      maybeNudge(used);
    }, 15000);
  }
  function maybeNudge(used) {
    if (M.status !== "guest") return;
    if (!$("#nudge").hidden || !$("#sos").hidden || !$("#present").hidden || location.hash === "#member") return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; // don't interrupt typing
    if (used < MBB.store.get("nudge.next", NUDGE_FIRST)) return;
    const gap = MBB.store.get("nudge.gap", NUDGE_GAP);
    MBB.store.set("nudge.next", used + gap);
    MBB.store.set("nudge.gap", Math.min(gap * 2, NUDGE_MAX_GAP));
    showNudge();
  }
  let nudgeReturn = null;
  function showNudge() {
    const el = $("#nudge");
    el.innerHTML = `<div class="sheet nudge" role="dialog" aria-modal="true" aria-labelledby="nudge-title">
      <span class="nudge-art">${icon("gift")}</span>
      <h2 id="nudge-title">${esc(t("nudge.title"))}</h2>
      <p>${esc(t("nudge.text"))}</p>
      ${M.offerCount ? `<p class="em">${esc(t("home.member.offers", { n: M.offerCount }))}</p>` : ""}
      <div class="actions"><a class="btn btn-main" href="#member" id="nudge-join">${esc(t("member.join"))}</a><button type="button" class="btn btn-ghost" id="nudge-later">${esc(t("nudge.later"))}</button></div>
      <p class="hint">${esc(t("nudge.guestNote"))}</p>
    </div>`;
    nudgeReturn = document.activeElement;
    el.hidden = false;
    $("#nudge-join").focus();
    $("#nudge-join").addEventListener("click", () => hideNudge(false));
    $("#nudge-later").addEventListener("click", () => hideNudge(true));
  }
  function hideNudge(restoreFocus = true) {
    const el = $("#nudge");
    if (el.hidden) return;
    el.hidden = true;
    if (restoreFocus) nudgeReturn?.focus?.();
  }

  MBB.member = { init, render, homeCard, hideNudge, showNudge, state: M };
})();
