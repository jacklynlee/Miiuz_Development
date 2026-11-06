/* Builds the Supabase sign-in emails in supabase/email/ (#28). Usage:
 *   npm run emails                    write supabase/email/confirm-signup.html and magic-link.html
 *   node scripts/build-emails.mjs --preview <dir>   also write sample pages per language, to look at
 * Paste each file into Supabase → Authentication → Emails → Templates (README → Membership → Set
 * up). Change the text here, not in the generated files: npm run check fails if they differ.
 *
 * Supabase fills the templates with Go's text/template: {{ .Token }} is the code, {{ .ConfirmationURL }}
 * the sign-in link, and {{ .Data }} the member's user_metadata, where js/member.js stores the app
 * language as `lang` when they join (and updates it when they change language while signed in).
 * EN, 简体中文, 한국어 and 日本語 are written here; every other language gets English. */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.miiuz-bb.com";
const LANGS = ["en", "zh", "ko", "ja"];
const HTML_LANG = { en: "en", zh: "zh-Hans", ko: "ko", ja: "ja" };

// Words for both emails. `signup` = Confirm signup (new members), `magic` = Magic Link (returning).
const T = {
  preheader: { en: "Your code: {{ .Token }}", zh: "你的验证码：{{ .Token }}", ko: "코드: {{ .Token }}", ja: "コード：{{ .Token }}" },
  title: {
    signup: { en: "Welcome to Miiuz BB", zh: "欢迎加入 Miiuz BB", ko: "Miiuz BB에 오신 걸 환영해요", ja: "Miiuz BB へようこそ" },
    magic: { en: "Your Miiuz BB sign-in code", zh: "你的 Miiuz BB 登录验证码", ko: "Miiuz BB 로그인 코드", ja: "Miiuz BB のログインコード" },
  },
  intro: { en: "Enter this code in Miiuz BB:", zh: "请在 Miiuz BB 里输入这个验证码：", ko: "Miiuz BB에 이 코드를 입력하세요.", ja: "Miiuz BB でこのコードを入力してください。" },
  valid: { en: "It works for 1 hour, and only once.", zh: "验证码 1 小时内有效，只能使用一次。", ko: "코드는 1시간 동안 한 번만 쓸 수 있어요.", ja: "有効期限は1時間で、1回だけ使えます。" },
  points: { en: "Enter it to finish joining, and you get 10 points.", zh: "输入验证码即可完成注册，并获得 10 积分。", ko: "코드를 입력하면 가입이 끝나고 10포인트를 받아요.", ja: "コードを入力すると登録が完了し、10ポイントがもらえます。" },
  linkLead: { en: "Or tap to sign in on this device:", zh: "或者点下面的按钮，在这台设备上登录：", ko: "또는 이 기기에서 바로 로그인하세요.", ja: "または、この端末でそのままログイン：" },
  button: {
    signup: { en: "Confirm and sign in", zh: "确认并登录", ko: "확인하고 로그인", ja: "確認してログイン" },
    magic: { en: "Sign in", zh: "登录", ko: "로그인", ja: "ログイン" },
  },
  installed: {
    en: "Using Miiuz BB from your home screen? Type the code there. The link opens your browser instead.",
    zh: "从手机主屏幕打开 Miiuz BB？请在那里输入验证码。这个链接会在浏览器里打开。",
    ko: "홈 화면의 Miiuz BB를 쓰고 있나요? 거기에 코드를 입력하세요. 링크는 브라우저에서 열려요.",
    ja: "ホーム画面の Miiuz BB をお使いですか？そこでコードを入力してください。リンクはブラウザで開きます。",
  },
  safety: {
    en: "Didn't ask for this? Just ignore this email. Miiuz never asks for this code by phone, WhatsApp or WeChat.",
    zh: "不是你本人操作？忽略这封邮件即可。Miiuz 绝不会通过电话、WhatsApp 或微信向你索要验证码。",
    ko: "요청한 적이 없다면 이 메일을 무시하세요. Miiuz는 전화, WhatsApp, WeChat으로 이 코드를 묻지 않아요.",
    ja: "心当たりがない場合は、このメールを無視してください。Miiuz が電話・WhatsApp・WeChat でこのコードを聞くことはありません。",
  },
  why: {
    signup: {
      en: "You're getting this because this email address was used to join Miiuz BB.",
      zh: "你收到这封邮件，是因为有人用这个邮箱地址注册 Miiuz BB。",
      ko: "이 이메일 주소로 Miiuz BB 가입 요청이 있어 보내 드렸어요.",
      ja: "このメールアドレスで Miiuz BB への登録があったため、お送りしています。",
    },
    magic: {
      en: "You're getting this because this email address was used to sign in to Miiuz BB.",
      zh: "你收到这封邮件，是因为有人用这个邮箱地址登录 Miiuz BB。",
      ko: "이 이메일 주소로 Miiuz BB 로그인 요청이 있어 보내 드렸어요.",
      ja: "このメールアドレスで Miiuz BB へのログインがあったため、お送りしています。",
    },
  },
};

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Text may hold Go template actions ({{ .Token }}); escape around them.
const txt = s => s.split(/(\{\{[^}]*\}\})/).map((p, i) => (i % 2 ? p : esc(p))).join("");

const C = { bg: "#f2f5f1", card: "#ffffff", fg: "#16211e", muted: "#5a6b65", line: "#cdd9d3", teal: "#0d6662", tealSoft: "#d5ebe8", hibiscus: "#b5172f", turmeric: "#d99a1e" };
// Single quotes inside: these go into style="…" attributes.
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans', 'Apple SD Gothic Neo', 'Noto Sans CJK SC', 'Microsoft YaHei', 'Malgun Gothic', sans-serif`;
const MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`;

// One language's email body (the part inside the outer layout).
function body(kind, l) {
  const w = k => txt((T[k][kind] || T[k])[l]);
  return `
          <tr><td class="card" style="background:${C.card};padding:28px 28px 8px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
            <h1 class="fg" style="margin:0 0 12px;font-size:24px;line-height:1.3;color:${C.fg};font-weight:700;">${w("title")}</h1>
            <p class="fg" style="margin:0 0 14px;font-size:16px;line-height:1.5;color:${C.fg};">${w("intro")}</p>
          </td></tr>
          <tr><td class="card" align="center" style="background:${C.card};padding:4px 28px 6px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
            <div class="code" style="display:inline-block;margin:0;padding:14px 22px;border:2px solid ${C.teal};border-radius:12px;background:${C.tealSoft};color:${C.teal};font-family:${MONO};font-size:34px;line-height:1.1;font-weight:700;letter-spacing:8px;">{{ .Token }}</div>
          </td></tr>
          <tr><td class="card" style="background:${C.card};padding:12px 28px 22px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
            <p class="muted" style="margin:0;font-size:14px;line-height:1.5;color:${C.muted};text-align:center;">${w("valid")}</p>
            ${kind === "signup" ? `<p class="fg" style="margin:10px 0 0;font-size:15px;line-height:1.5;color:${C.fg};text-align:center;font-weight:700;">${w("points")}</p>` : ""}
          </td></tr>
          <tr><td class="card" style="background:${C.card};padding:18px 28px 6px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};border-top:1px solid ${C.line};">
            <p class="fg" style="margin:0 0 12px;font-size:15px;line-height:1.5;color:${C.fg};">${w("linkLead")}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:${C.teal};">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:11px 22px;border-radius:999px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${w("button")}</a>
            </td></tr></table>
            <p class="muted" style="margin:12px 0 0;font-size:13px;line-height:1.5;color:${C.muted};">${w("installed")}</p>
          </td></tr>
          <tr><td class="card" style="background:${C.card};padding:16px 28px 24px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};border-bottom:1px solid ${C.line};border-radius:0 0 14px 14px;">
            <p class="warn" style="margin:0;padding:10px 12px;border-radius:8px;background:#f8ecd2;color:${C.fg};font-size:13px;line-height:1.5;">${w("safety")}</p>
          </td></tr>
          <tr><td style="padding:16px 12px 0;">
            <p class="muted" style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${C.muted};text-align:center;">${w("why")}</p>`;
}

function template(kind) {
  // printf turns a missing lang (members from before #28) into "<nil>", so the comparisons below
  // never fail, and those members get English.
  const choose = parts => `{{ if eq $l "zh" }}${parts.zh}{{ else if eq $l "ko" }}${parts.ko}{{ else if eq $l "ja" }}${parts.ja}{{ else }}${parts.en}{{ end }}`;
  const per = fn => Object.fromEntries(LANGS.map(l => [l, fn(l)]));
  return `{{ $l := printf "%v" .Data.lang }}<!doctype html>
<!-- Generated by scripts/build-emails.mjs (#28). Edit the text there, then: npm run emails.
     Supabase → Authentication → Emails → Templates → ${kind === "signup" ? "Confirm signup" : "Magic Link"}. -->
<html lang="${choose(HTML_LANG)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Miiuz BB</title>
<style>
  body { margin: 0; padding: 0; }
  @media (prefers-color-scheme: dark) {
    .bg { background: #0f1715 !important; }
    .card { background: #17211e !important; border-color: #2e3f3a !important; }
    .fg { color: #e7efec !important; }
    .muted { color: #9db0aa !important; }
    .code { background: #16342f !important; color: #7fd8d0 !important; border-color: #4fc1b8 !important; }
    .warn { background: #3a2f17 !important; color: #e7efec !important; }
    .link { color: #4fc1b8 !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${C.bg};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${choose(per(l => txt(T.preheader[l])))}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
  <tr><td align="center" style="padding:24px 12px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
      <tr><td style="background:${C.teal};border-radius:14px 14px 0 0;padding:16px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:12px;"><img src="${SITE}/icons/icon-192.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px;"></td>
          <td style="color:#ffffff;font-size:20px;line-height:1.1;font-weight:700;">Miiuz <span style="color:${C.turmeric};">BB</span><br>
            <span style="font-size:10px;letter-spacing:3px;font-weight:700;color:#d5ebe8;">BEYOND BORDERS</span></td>
        </tr></table>
      </td></tr>${choose(per(l => body(kind, l)))}
            <p class="muted" style="margin:0;font-size:12px;line-height:1.5;color:${C.muted};text-align:center;">Miiuz Beyond Borders Sdn. Bhd. · <a class="link" href="${SITE}" style="color:${C.teal};">www.miiuz-bb.com</a></p>
          </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

export const FILES = { "supabase/email/confirm-signup.html": template("signup"), "supabase/email/magic-link.html": template("magic") };

// Sample pages for one language, with a made-up code and link (Go template actions filled in).
export function preview(src, lang) {
  return src
    .replace(/^\{\{ \$l := printf "%v" \.Data\.lang \}\}/, "")
    .replace(/\{\{ if eq \$l "zh" \}\}([\s\S]*?)\{\{ else if eq \$l "ko" \}\}([\s\S]*?)\{\{ else if eq \$l "ja" \}\}([\s\S]*?)\{\{ else \}\}([\s\S]*?)\{\{ end \}\}/g,
      (m, zh, ko, ja, en) => ({ zh, ko, ja }[lang] ?? en))
    .replaceAll("{{ .Token }}", "482915")
    .replaceAll("{{ .ConfirmationURL }}", "https://example.supabase.co/auth/v1/verify?token=sample&type=magiclink");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [f, src] of Object.entries(FILES)) {
    mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    writeFileSync(path.join(root, f), src);
    console.log("wrote", f);
  }
  const i = process.argv.indexOf("--preview");
  if (i > 0) {
    const dir = path.resolve(process.argv[i + 1] || "preview/email");
    mkdirSync(dir, { recursive: true });
    for (const [f, src] of Object.entries(FILES)) for (const l of [...LANGS, "ms"]) writeFileSync(path.join(dir, `${path.basename(f, ".html")}.${l}.html`), preview(src, l));
    console.log("previews in", dir);
  }
}
