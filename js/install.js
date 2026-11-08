/* Miiuz Beyond Borders — "install this app" card on Home.
 * Android / desktop Chrome: one tap via the browser's install prompt.
 * iPhone / iPad Safari: shows the Share → Add to Home Screen steps.
 * Hidden once installed, when already running as an app, or after "Hide".
 * WeChat's in-app browser, where shared links and the poster's QR code open, can't install apps:
 * there a bar explains how to open Miiuz BB in the phone's browser instead (#18). */
(function () {
  const MBB = window.MBB;
  const { $, esc, t, icon } = MBB;
  let prompt = null;

  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); prompt = e; MBB.emit("install"); });
  window.addEventListener("appinstalled", () => { prompt = null; MBB.store.set("installed", true); MBB.emit("install"); });

  const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  const wechat = /MicroMessenger/i.test(navigator.userAgent);
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  MBB.install = {
    wechat,
    // The "open in your browser" bar, shown inside WeChat until the traveller taps "Got it".
    wxBar() {
      const el = $("#wxbar");
      if (!wechat || MBB.store.get("wx.hidden", false)) { el.hidden = true; return; }
      el.innerHTML = `<div class="wrap trbar-in">${icon("external")}<span><b>${esc(t("wx.title"))}</b> ${esc(t("wx.lead"))}</span>
        <button type="button" class="btn btn-ghost btn-sm" id="wx-ok">${esc(t("wx.ok"))}</button></div>`;
      el.hidden = false;
      $("#wx-ok").addEventListener("click", () => { MBB.store.set("wx.hidden", true); el.hidden = true; });
    },
    card() {
      if (wechat) return "";
      if (standalone() || window.claude || MBB.store.get("installed", false) || MBB.store.get("install.hidden", false)) return "";
      if (!prompt && !ios()) return "";
      return `<section class="card install-card">
        <span class="badge-ic">${icon("download")}</span>
        <div><b>${esc(t("install.title"))}</b><small>${esc(prompt ? t("install.lead") : t("install.ios"))}</small></div>
        <div class="actions">
          ${prompt ? `<button type="button" class="btn btn-ai btn-sm" id="install-go">${esc(t("install.button"))}</button>` : ""}
          <button type="button" class="btn btn-ghost btn-sm" id="install-hide">${esc(t("install.hide"))}</button>
        </div>
      </section>`;
    },
    bind() {
      $("#install-go")?.addEventListener("click", async () => {
        if (!prompt) return;
        prompt.prompt();
        try { await prompt.userChoice; } catch { /* dismissed */ }
        prompt = null;
        MBB.emit("install");
      });
      $("#install-hide")?.addEventListener("click", () => { MBB.store.set("install.hidden", true); MBB.emit("install"); });
    },
  };
})();
