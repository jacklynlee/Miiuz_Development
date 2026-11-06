/* Builds a single-file preview of the app (all CSS and JS inlined) for publishing
 * as a claude.ai artifact. Usage: node scripts/build-preview.mjs [output.html] */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] || path.join(root, "preview", "miiuz-bb.html"));
const read = rel => readFileSync(path.join(root, rel), "utf8");

const html = read("index.html");
const start = html.indexOf("<!-- preview:start -->"), end = html.indexOf("<!-- preview:end -->");
if (start < 0 || end < 0) throw new Error("preview markers missing in index.html");

let page = html.slice(start + "<!-- preview:start -->".length, end)
  .replace(/<!-- pwa:start -->[\s\S]*?<!-- pwa:end -->\s*/, "")
  .replace(/<\/head>\s*<body>/, "")
  .replace('<link rel="stylesheet" href="css/app.css">', () => `<style>\n${read("css/app.css")}\n</style>`)
  // The preview is a single file, so the self-hosted fonts aren't there; claude.ai allows Google Fonts.
  .replace('<link rel="stylesheet" href="css/fonts.css">', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@600;900&family=Noto+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@500;600&display=swap">')
  .replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, src) => {
    const code = read(src);
    if (/<\/script/i.test(code)) throw new Error(`${src} contains "</script"`);
    return `<script>\n${code}\n</script>`;
  });

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, page.trim() + "\n");
console.log(`Preview written to ${out} (${(Buffer.byteLength(page) / 1024).toFixed(0)} KB)`);
