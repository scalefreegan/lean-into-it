// Who may call the API: this machine, from this app's own pages. A leaf
// module (no imports), so any route can use it without a cycle; api.ts
// applies all three in wrap().

/**
 * Reject cross-origin requests. Without this, any website the user visits
 * while the app is up can POST to these routes — a text/plain body is a
 * CORS "simple request" (no preflight), so the browser sends it — and
 * /api/check and /api/playground hand their text to Lean, which can run
 * arbitrary code while elaborating it. A request with no Origin (same-origin
 * navigation, curl) is allowed; one whose Origin host doesn't match the
 * request Host is refused. Pure, so a test pins the rule rather than the
 * wiring.
 */
export function sameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true; // no Origin → not a cross-site fetch
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Only this machine's own names. The same-origin check compares Origin with
 * Host, and a page on another site that resolves its own name to 127.0.0.1
 * (DNS rebinding) sends a matching pair; its Host is still not localhost.
 *
 * `publicHosts` (decided 2026-11-24) adds this machine's own Tailscale
 * MagicDNS name(s), comma-separated — set by `web/vite.config.ts` into
 * `LEAN_PUBLIC_HOST` from the gitignored repo-root `.env.local`, the same
 * mechanism Wine Guide and Fret Not use, before any request can arrive, so
 * the default here always sees the validated list. The check still stops
 * DNS rebinding (a page's own name is not on the list), but it does not
 * authenticate anyone: any device that can reach the tailnet address can send
 * this Host and APP_HEADER and so run Lean as this user. Who may reach it is
 * up to the tailnet's membership and access rules; never `tailscale funnel`.
 * `sameOrigin` and `fromApp` still apply unchanged.
 */
export function localHost(host: string | undefined, publicHosts: string | undefined = process.env.LEAN_PUBLIC_HOST): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, "").toLowerCase();
  if (name === "localhost" || name === "127.0.0.1" || name === "[::1]") return true;
  if (!publicHosts) return false;
  return publicHosts
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .includes(name);
}

/** The header only the app's own code sends (web/src/api/client.ts, scripts/lean-mcp.mjs). */
export const APP_HEADER = "x-lean-into-it";

/**
 * The request came from the app, not just from this machine. A request
 * with no Origin passes sameOrigin, so without this any program here could
 * read the history and progress routes, among them a web fetch the Tutor
 * makes from a page that told it to (bead lii-2zo.7). A browser says where
 * a request came from (Sec-Fetch-Site): from another site it is refused
 * whatever it carries, from this one it passes (an <audio> element cannot
 * add a header). Anything that does not say must carry APP_HEADER, which a
 * fetch tool steered by a page, an <img> or a link cannot add. It is not a
 * secret (a program here can send it on purpose); it stops a client that
 * cannot choose its headers. A page on another local port can get a
 * preflight for it past Vite's cors, but its Origin is still refused. Pure.
 */
export function fromApp(headers: Record<string, string | string[] | undefined>): boolean {
  const site = headers["sec-fetch-site"];
  if (site !== undefined) return site === "same-origin";
  return headers[APP_HEADER] === "1";
}
