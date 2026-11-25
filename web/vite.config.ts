import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// The API is Vite `apply:"serve"` middleware on the dev server — there is no
// separate backend. See server/api.ts.
import { apiPlugins } from "./server/api.ts";
import { readPublicHosts } from "./server/publichost.ts";

// The owner's tailnet names, if any (server/publichost.ts). Vite 403s any
// Host it doesn't know, and wrap() refuses any that apiPlugins was not given.
const publicHosts = readPublicHosts(process.env, undefined, (entry) => console.warn(`[lean-into-it] ignoring LEAN_PUBLIC_HOST entry ${JSON.stringify(entry)}: not a *.ts.net name`));

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugins({ publicHosts })],
  // Fixed port so the Mac app (macos/) has a deterministic URL;
  // strict so a second instance fails loudly instead of serving a twin on the
  // next port. 38800 = Lean Into It; Fret Not is 38600, jev-ants 38500, Lingo
  // Dojo 38400, Atlas 38300, Wine Guide 38200 and Trail Train 38100.
  // Polling watcher: macOS FSEvents delivery is unreliable on this machine,
  // which silently kills HMR. content/, lean/ and data/ sit outside web/, so
  // content edits never trigger a reload; the UI re-reads them through the API.
  server: {
    port: 38800,
    strictPort: true,
    watch: { usePolling: true, interval: 300 },
    ...(publicHosts.length ? { allowedHosts: publicHosts } : {}),
  },
});
