import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// api/* runs as Vercel serverless functions, not through Vite. For local
// full-stack dev use `vercel dev` (proxies both); plain `vite dev` serves
// the frontend only and API calls will fail unless proxied separately.
export default defineConfig({
  plugins: [react()],
  // GeometryCanvas (three.js + @react-three/*) is lazy-loaded as its own
  // chunk specifically so it's excluded from the initial page load — its
  // size (~900kB) is expected there and isn't the "one big bundle" problem
  // this warning normally flags.
  build: { chunkSizeWarningLimit: 1000 },
});
