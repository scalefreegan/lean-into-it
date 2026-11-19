import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// The API is Vite `apply:"serve"` middleware on the dev server — there is no
// separate backend. See server/api.ts.
import { apiPlugins } from "./server/api.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugins()],
  // Fixed port so the Mac app (macos/) has a deterministic URL;
  // strict so a second instance fails loudly instead of serving a twin on the
  // next port. 38800 = Lean Into It; Fret Not is 38600, jev-ants 38500, Lingo
  // Dojo 38400, Atlas 38300, Wine Guide 38200 and Basecamp 38100.
  // Polling watcher: macOS FSEvents delivery is unreliable on this machine,
  // which silently kills HMR. content/, lean/ and data/ sit outside web/, so
  // content edits never trigger a reload; the UI re-reads them through the API.
  server: { port: 38800, strictPort: true, watch: { usePolling: true, interval: 300 } },
});
