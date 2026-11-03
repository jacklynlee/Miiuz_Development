/* Miiuz Beyond Borders — where the app's AI features run.
 *   "artifact": opened inside Claude (claude.ai artifact) → window.claude's `sample`
 *   "server":   our own /api endpoints (Vercel) with ANTHROPIC_API_KEY set
 *   "off":      neither; chat explains how to switch it on, AI translation falls back to English */
(function () {
  const MBB = window.MBB;
  const ai = (MBB.ai = { mode: "pending", sample: null, sampleTools: false });

  ai.ready = (async () => {
    if (window.claude?.use) {
      try { ai.sample = await window.claude.use("sample"); } catch { ai.sample = null; }
      if (ai.sample) {
        try { ai.sampleTools = !!(await ai.sample.limits())?.tools; } catch { ai.sampleTools = false; }
        ai.mode = "artifact";
        return ai;
      }
    }
    try {
      const r = await fetch("api/chat", { method: "GET", cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      ai.mode = j?.configured ? "server" : "off";
    } catch {
      ai.mode = "off";
    }
    // For developers only; travellers see a plain message (ask.footOff).
    if (ai.mode === "off") console.info("Miiuz: Ask Miiuz and AI translation are off. GET /api/chat must report configured:true. Set ANTHROPIC_API_KEY in Vercel and redeploy (README → Deploy).");
    return ai;
  })();

  // Called when the viewer declines AI in Claude, or the platform withdraws it.
  ai.disable = () => { ai.mode = "off"; MBB.emit("ai"); };
  ai.FATAL = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];
})();
