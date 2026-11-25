import fs from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// The API is Vite `apply:"serve"` middleware on the dev server — there is no
// separate backend. See server/api.ts.
import { apiPlugins } from "./server/api.ts";

// The tailnet name `tailscale serve` answers under (CLAUDE.md, "never serve
// this app on a network" — the 2026-11-24 exception for this user's own
// tailnet). Vite 403s any Host it doesn't know, so the name must be listed;
// it comes from LEAN_PUBLIC_HOST in the shell, else the gitignored
// repo-root .env.local (the Dock app starts the server without a shell
// profile), so the name is never committed. Comma-separated plain hostnames
// only: no scheme, port, path or wildcard, since Vite reads a leading dot as
// "and every subdomain". Unset: nothing is added and only localhost works,
// as before. The validated list is also written back to
// `process.env.LEAN_PUBLIC_HOST` so `web/server/origin.ts`'s `localHost()` —
// in this same process, before any request can arrive — sees the same,
// already-validated names without re-parsing the file itself.
const PLAIN_HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
function publicHosts(): string[] {
  let value = process.env.LEAN_PUBLIC_HOST;
  if (!value?.trim()) {
    try {
      value = parseEnv(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")).LEAN_PUBLIC_HOST;
    } catch {
      /* no file: no public host */
    }
  }
  const hosts: string[] = [];
  for (const raw of String(value ?? "").split(",")) {
    const h = raw.trim().toLowerCase();
    if (!h) continue;
    if (PLAIN_HOST.test(h)) hosts.push(h);
    else console.warn(`[lean-into-it] ignoring LEAN_PUBLIC_HOST entry ${JSON.stringify(raw.trim())}: not a plain hostname`);
  }
  return hosts;
}
const allowedHosts = publicHosts();
if (allowedHosts.length) process.env.LEAN_PUBLIC_HOST = allowedHosts.join(",");

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugins()],
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
    ...(allowedHosts.length ? { allowedHosts } : {}),
  },
});
