/* Miiuz Beyond Borders — the Miiuz assistant.
 * Two transports:
 *  - "server": POST /api/chat (our Vercel function → Claude API, with web search).
 *    The history below is sent back verbatim each turn and only ever appended to:
 *    the API ties Claude's reasoning to the exact conversation, so earlier turns
 *    must never be edited, trimmed or reordered. A long chat ends with "New chat".
 *  - "artifact": inside a claude.ai artifact viewer, via window.claude's `sample`.
 * Neither available → the chat explains how to switch it on; the rest of the app works. */
(function () {
  const MBB = window.MBB;
  const { $, $$, esc, t, icon } = MBB;

  let mode = "pending";      // pending | server | artifact | off
  let sample = null, sampleTools = false;
  let history = [];          // server mode: Claude API messages, append-only
  let turns = [];            // artifact mode: plain-text turns
  let busy = false, ctl = null;
  const MAX_BYTES = 1_200_000;
  const MAX_ARTIFACT_TURNS = 16;

  const msgs = () => $("#c-msgs");
  const bytes = v => new Blob([JSON.stringify(v)]).size;

  /* ---------- rendering ---------- */
  function inline(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(（])(https?:\/\/[^\s<)）]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  }
  function md(text) {
    let html = "", list = false;
    for (const raw of esc(text).split("\n")) {
      const line = raw.trimEnd();
      const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (m) { if (!list) { html += "<ul>"; list = true; } html += `<li>${inline(m[1])}</li>`; continue; }
      if (list) { html += "</ul>"; list = false; }
      if (line.trim()) html += `<p>${inline(line)}</p>`;
    }
    return list ? html + "</ul>" : html;
  }
  function add(kind, html) {
    const d = document.createElement("div");
    d.className = `msg ${kind}`;
    d.innerHTML = html;
    msgs().append(d);
    msgs().scrollTop = msgs().scrollHeight;
    return d;
  }
  // A bot bubble that can show streamed text, a status line and sources.
  function botBubble() {
    const el = add("bot", `<div class="body"><p>${esc(t("ask.thinking"))}</p></div><span class="status" hidden></span>`);
    const body = el.querySelector(".body"), status = el.querySelector(".status");
    return {
      el, has: false,
      text(s) { this.has = !!s; body.innerHTML = md(s) || `<p>${esc(t("ask.thinking"))}</p>`; msgs().scrollTop = msgs().scrollHeight; },
      status(s) { status.textContent = s || ""; status.hidden = !s; },
      sources(list) {
        if (!list.length) return;
        const links = list.slice(0, 5).map(s => {
          let label = s.title;
          if (!label) { try { label = new URL(s.url).hostname; } catch { label = s.url; } }
          return `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
        }).join("");
        el.insertAdjacentHTML("beforeend", `<div class="srcs"><b>${esc(t("ask.sources"))}</b>${links}</div>`);
      },
      note(s) { el.insertAdjacentHTML("beforeend", `<span class="status">${esc(s)}</span>`); },
    };
  }
  function planNote() {
    add("note", `${icon("check")}<span>${esc(t("ask.planUpdated"))}</span><a href="#plan">${esc(t("ask.viewPlan"))}</a>`);
  }
  function setBusy(b) {
    busy = b;
    $("#c-send").disabled = b || mode === "pending" || mode === "off";
    $("#c-stop").hidden = !b;
  }
  function renderSuggest() {
    const box = $("#c-suggest");
    const show = mode !== "off" && !history.length && !turns.length;
    box.hidden = !show;
    box.innerHTML = show ? t("ask.suggest").map(s => `<button type="button">${esc(s)}</button>`).join("") : "";
  }
  function setFoot() {
    $("#c-foot").textContent = mode === "server" ? t("ask.footServer") : mode === "artifact" ? t("ask.footArtifact") : mode === "off" ? t("ask.footOff") : "";
    $("#c-form").hidden = mode === "off";
    setBusy(busy);
    renderSuggest();
  }

  /* ---------- context ---------- */
  const englishName = c => { try { return new Intl.DisplayNames(["en"], { type: "region" }).of(c) || c; } catch { return c; } };
  function contextText() {
    const plan = MBB.planner.snapshot();
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: MBB.C.timezone, weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const home = MBB.state.home, r = MBB.rate(home);
    return MBB.prompt.contextBlock({
      localTime: `${now} (${MBB.C.name.en} time, UTC+8)`,
      appLang: MBB.LANGS[MBB.state.lang].name,
      replyLang: $("#c-lang").value,
      from: MBB.state.from ? `${MBB.state.from} (${englishName(MBB.state.from)})${MBB.state.fromOk ? "" : ", guessed by the app"}` : null,
      home, rate: r ? (r >= 100 ? r.toFixed(0) : r.toFixed(3)) : null, rateLive: MBB.fx.live,
      cityName: MBB.C.cities[plan.city].en,
      plan,
      hotel: MBB.trip.whereText(), // the current stay, or the hotel typed in My trip
    });
  }

  /* ---------- tools run in the page ---------- */
  function runUpdatePlan(input) {
    const result = MBB.planner.applyAI(input); // throws with a message Claude can act on
    planNote();
    return result;
  }

  /* ---------- server transport ---------- */
  async function streamTurn(messages, h) {
    const res = await MBB.api("api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }), signal: ctl.signal,
    });
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      throw { code: j.code || (res.status === 429 ? "rate_limited" : "upstream") };
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", done = null;
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(chunk)?.[1], data = /^data: (.*)$/m.exec(chunk)?.[1];
        if (!ev || data == null) continue;
        const d = JSON.parse(data);
        if (ev === "text") h.text(d.text);
        else if (ev === "status") h.status(d);
        else if (ev === "restart") h.restart();
        else if (ev === "error") throw { code: d.code || "upstream" };
        else if (ev === "done") done = d;
      }
    }
    if (!done) throw { code: "network" };
    return done;
  }

  async function askServer(text, bubble) {
    const userMsg = { role: "user", content: [{ type: "text", text: contextText() }, { type: "text", text }] };
    if (bytes(history) + bytes(userMsg) > MAX_BYTES) { bubble.text(t("ask.tooLong")); return; }
    const mark = history.length;
    history.push(userMsg);
    let shown = "", cur = "";
    const sources = new Map();
    try {
      for (let round = 0; round < 6; round++) {
        cur = "";
        const res = await streamTurn(history, {
          text(d) { cur += d; bubble.status(""); bubble.text(shown + cur); },
          status(s) { if (s.kind === "search") bubble.status(s.query ? t("ask.searching", { q: s.query }) : t("ask.searchingAny")); },
          restart() { cur = ""; bubble.text(shown); },
        });
        if (res.stop_reason === "refusal") throw { code: "refused" };
        history.push({ role: "assistant", content: res.content });
        (res.sources || []).forEach(s => sources.set(s.url, s));
        if (cur) shown += (shown ? "\n\n" : "") + cur;
        if (res.stop_reason === "pause_turn") continue;
        if (res.stop_reason === "tool_use") {
          const results = res.content.filter(b => b.type === "tool_use").map(b => {
            try {
              if (b.name !== "update_plan") throw new Error(`Unknown tool ${b.name}`);
              return { type: "tool_result", tool_use_id: b.id, content: String(runUpdatePlan(b.input)) };
            } catch (e) {
              return { type: "tool_result", tool_use_id: b.id, is_error: true, content: String(e?.message || e) };
            }
          });
          history.push({ role: "user", content: results });
          continue;
        }
        if (res.stop_reason === "max_tokens") bubble.note(t("ask.truncated"));
        break;
      }
      bubble.status("");
      if (!shown) bubble.text("…");
      bubble.sources([...sources.values()]);
    } catch (e) {
      history.length = mark; // drop only this turn's tail; earlier turns stay untouched
      throw e;
    }
  }

  /* ---------- artifact transport ---------- */
  let artifactRules = null;
  async function askArtifact(text, bubble) {
    artifactRules ??= MBB.prompt.buildSystem(MBB.C, "artifact");
    turns.push({ role: "user", content: `${contextText()}\n\n${text}` });
    while (turns.length > MAX_ARTIFACT_TURNS) turns.shift();
    while (turns.length && turns[0].role !== "user") turns.shift();
    const opts = { signal: ctl.signal, cache: false, onText: ({ text: s }) => bubble.text(s) };
    if (sampleTools) {
      const s = MBB.prompt.planTool;
      opts.tools = [{ name: s.name, description: s.description, inputSchema: s.input_schema, execute: input => runUpdatePlan(input) }];
    }
    try {
      const { text: answer, truncated } = await sample([{ role: "user", content: artifactRules }, ...turns], opts);
      bubble.text(answer);
      if (truncated) bubble.note(t("ask.truncated"));
      turns.push({ role: "assistant", content: answer });
    } catch (e) {
      turns.pop();
      if (e?.code === "tools_unavailable") sampleTools = false;
      if (MBB.ai.FATAL.includes(e?.code)) MBB.ai.disable();
      if (e?.text && e.code !== "refused") bubble.text(e.text);
      throw e;
    }
  }

  /* ---------- sending ---------- */
  const ERR = { rate_limited: "ask.err.rate", session_expired: "ask.err.session", refused: "ask.err.refused", not_configured: "ask.err.off", network: "ask.err.network" };

  async function ask(text) {
    text = String(text || "").trim();
    if (!text || busy || (mode !== "server" && mode !== "artifact")) return;
    add("me", esc(text));
    $("#c-suggest").hidden = true;
    const bubble = botBubble();
    ctl = new AbortController();
    setBusy(true);
    try {
      if (mode === "server") await askServer(text, bubble);
      else await askArtifact(text, bubble);
    } catch (e) {
      bubble.status("");
      const code = e?.code || (e?.name === "AbortError" ? "cancelled" : "network");
      const msg = t(ERR[code] || "ask.err.generic");
      if (code === "cancelled") { if (!bubble.has) bubble.text("…"); bubble.note(t("ask.stopped")); }
      else if (code === "refused" || !bubble.has) bubble.text(msg);
      else bubble.note(msg);
    } finally {
      setBusy(false);
      ctl = null;
    }
  }

  function newChat() {
    ctl?.abort();
    history = []; turns = [];
    msgs().innerHTML = "";
    add("bot", `<p data-i18n="ask.hello">${esc(t("ask.hello"))}</p>`);
    renderSuggest();
  }

  async function detect() {
    const ai = await MBB.ai.ready;
    mode = ai.mode; sample = ai.sample; sampleTools = ai.sampleTools;
    setFoot();
  }

  // Reply-language choices: "same as my question" plus every app language.
  function buildLangOptions() {
    const sel = $("#c-lang"), keep = sel.value || MBB.store.get("chat.lang", "auto");
    sel.innerHTML = `<option value="auto">${esc(t("ask.langAuto"))}</option>` +
      Object.values(MBB.LANGS).map(l => `<option value="${esc(l.name)}">${esc(l.native)}</option>`).join("");
    sel.value = [...sel.options].some(o => o.value === keep) ? keep : "auto";
  }

  MBB.chat = {
    init() {
      // Not released yet (MBB.features.ask): show "Coming soon" and send nothing.
      const on = MBB.features.ask;
      $("#chat").hidden = !on;
      $("#ask-soon").hidden = on;
      if (!on) return;
      $("#c-form").addEventListener("submit", e => { e.preventDefault(); const v = $("#c-input").value; $("#c-input").value = ""; ask(v); });
      $("#c-input").addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#c-form").requestSubmit(); }
      });
      $("#c-suggest").addEventListener("click", e => { const b = e.target.closest("button"); if (b) ask(b.textContent); });
      $("#c-stop").addEventListener("click", () => ctl?.abort());
      $("#c-new").addEventListener("click", newChat);
      buildLangOptions();
      $("#c-lang").addEventListener("change", e => MBB.store.set("chat.lang", e.target.value));
      MBB.on("lang", () => { setFoot(); buildLangOptions(); });
      MBB.on("ai", () => { mode = MBB.ai.mode; setFoot(); });
      newChat();
      setFoot();
      detect();
    },
    ask,
    // Open the chat and send a question (from place pages and search); if Miiuz can't answer
    // right now, leave it in the box instead.
    async askAbout(text) {
      MBB.go("ask");
      if (!MBB.features.ask) return;
      await MBB.ai.ready;
      if ((mode === "server" || mode === "artifact") && !busy) ask(text);
      else MBB.chat.prefill(text);
    },
    prefill(text) {
      MBB.go("ask");
      if (!MBB.features.ask) return;
      const box = $("#c-input");
      box.value = text;
      requestAnimationFrame(() => { box.focus(); box.setSelectionRange(box.value.length, box.value.length); });
    },
  };
})();
