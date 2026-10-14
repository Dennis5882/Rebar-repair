import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

// App version shown in the footer — package.json is the single source; it is
// bumped only by `npm run release`, which also opens the matching release-notes
// entry (scripts/release-check.mjs fails the build if the two ever diverge).
const appVersion: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

// Stamps the footer byline with the actual build date (KST, matching the
// existing YYMMDD convention) so it stays in sync with each deployment
// instead of being hand-edited and going stale.
function buildDateStamp() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const yy = String(kst.getUTCFullYear()).slice(2);
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}


// Per-language share links: chat link previews do not run JS, they read the
// static <title>/og tags. So the build emits /<lang>/index.html (en, ko,
// zh-CN, zh-TW, plus lowercase) with that language's meta.title/meta.desc from
// public/locales; the root (/) stays Korean. The app starts in the path's
// language (I18nProvider.langFromPath).
const OG_LOCALE: Record<string, string> = { ko: "ko_KR", en: "en_US", "zh-CN": "zh_CN", "zh-TW": "zh_TW" };
const HTML_LANG: Record<string, string> = { ko: "ko", en: "en", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" };
const META_RE = /<!--meta-->[\s\S]*?<!--\/meta-->/;
function langPages(): Plugin {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const meta = (code: string) => {
    const d = JSON.parse(readFileSync(resolve(ROOT, "public/locales", `${code}.json`), "utf8")) as Record<string, string>;
    const title = esc(d["meta.title"]), desc = esc(d["meta.desc"]);
    return `<!--meta--><title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:locale" content="${OG_LOCALE[code]}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}"><!--/meta-->`;
  };
  return {
    name: "lang-pages",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (ctx.path !== "/index.html" || !META_RE.test(html)) return html;
        return html.replace(META_RE, meta("ko"));
      },
    },
    closeBundle() {
      if (process.env.VITEST) return;
      let base: string;
      try { base = readFileSync(resolve(ROOT, "dist/index.html"), "utf8"); } catch { return; }
      for (const code of Object.keys(OG_LOCALE)) {
        const page = base.replace(/<html lang="[^"]*">/, `<html lang="${HTML_LANG[code]}">`).replace(META_RE, meta(code));
        for (const dir of new Set([code, code.toLowerCase()])) {
          mkdirSync(resolve(ROOT, "dist", dir), { recursive: true });
          writeFileSync(resolve(ROOT, "dist", dir, "index.html"), page);
        }
      }
    },
  };
}

// api/* runs as Vercel serverless functions, not through Vite. For local
// full-stack dev use `vercel dev` (proxies both); plain `vite dev` serves
// the frontend only and API calls will fail unless proxied separately.
export default defineConfig({
  plugins: [react(), langPages()],
  define: {
    __BUILD_DATE__: JSON.stringify(buildDateStamp()),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  // GeometryCanvas (three.js + @react-three/*) is lazy-loaded as its own
  // chunk specifically so it's excluded from the initial page load — its
  // size (~900kB) is expected there and isn't the "one big bundle" problem
  // this warning normally flags.
  build: { chunkSizeWarningLimit: 1000 },
});
