/* Miiuz Beyond Borders — "install this app" card on Home.
 * Android / desktop Chrome: one tap via the browser's install prompt.
 * iPhone / iPad Safari: shows the Share → Add to Home Screen steps. Chrome, Edge and Firefox on
 * iPhone get their own steps (iOS 16.4+). In-app browsers (Instagram, Facebook, LINE, TikTok,
 * Android WebViews…) can't install, so the card says to open the page in the browser first (#31).
 * Hidden once installed, when already running as an app, or after "Hide". */
(function () {
  const MBB = window.MBB;
  const { $, esc, t, icon } = MBB;
  let prompt = null;

  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); prompt = e; MBB.emit("install"); });
  window.addEventListener("appinstalled", () => { prompt = null; MBB.store.set("installed", true); MBB.emit("install"); });

  const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  const UA = navigator.userAgent || "";
  const ios = () => /iphone|ipad|ipod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const iosOther = () => /CriOS|EdgiOS|FxiOS/.test(UA);
  const inApp = () => /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Snapchat|; wv\)/.test(UA);

  MBB.install = {
    card() {
      if (standalone() || window.claude || MBB.store.get("installed", false) || MBB.store.get("install.hidden", false)) return "";
      const how = prompt ? "install.lead" : inApp() ? "install.inApp" : ios() ? (iosOther() ? "install.iosOther" : "install.ios") : "";
      if (!how) return "";
      return `<section class="card install-card">
        <span class="badge-ic">${icon("download")}</span>
        <div><b>${esc(t("install.title"))}</b><small>${esc(t(how))}</small></div>
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
