import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// api/* runs as Vercel serverless functions, not through Vite. For local
// full-stack dev use `vercel dev` (proxies both); plain `vite dev` serves
// the frontend only and API calls will fail unless proxied separately.
export default defineConfig({
  plugins: [react()],
});
