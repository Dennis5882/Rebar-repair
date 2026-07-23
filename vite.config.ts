import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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

// api/* runs as Vercel serverless functions, not through Vite. For local
// full-stack dev use `vercel dev` (proxies both); plain `vite dev` serves
// the frontend only and API calls will fail unless proxied separately.
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_DATE__: JSON.stringify(buildDateStamp()),
  },
  // GeometryCanvas (three.js + @react-three/*) is lazy-loaded as its own
  // chunk specifically so it's excluded from the initial page load — its
  // size (~900kB) is expected there and isn't the "one big bundle" problem
  // this warning normally flags.
  build: { chunkSizeWarningLimit: 1000 },
});
