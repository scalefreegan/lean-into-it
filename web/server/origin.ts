// Who may call the API: this machine, from this app's own pages. A leaf
// module (no imports), so any route can use it without a cycle; api.ts
// applies mayCall, which is all of it, in wrap().

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

/** The tailnet names this server also answers to (publichost.ts), set by apiPlugins() before any request arrives. None by default. */
let configured: readonly string[] = [];
export function setPublicHosts(hosts: readonly string[]): void {
  configured = [...hosts];
}
export function publicHosts(): readonly string[] {
  return configured;
}

const hostName = (host: string) => host.replace(/:\d+$/, "").toLowerCase();

/** This machine's loopback names. */
export function loopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostName(host));
}

/**
 * Only this machine's own names. The same-origin check compares Origin with
 * Host, and a page on another site that resolves its own name to 127.0.0.1
 * (DNS rebinding) sends a matching pair; its Host is still not localhost.
 * The owner's tailnet names (decided 2026-11-24) count too, under the
 * stricter rule in tailnetRequest.
 */
export function localHost(host: string | undefined, hosts: readonly string[] = configured): boolean {
  if (!host) return false;
  return loopbackHost(host) || hosts.includes(hostName(host));
}

/**
 * What a request under a tailnet name must also show. That name, unlike
 * localhost, is looked up in DNS: whoever answers the browser's lookups (a
 * hostile network, Tailscale off) can serve a plain-http page under it and
 * then point it at 127.0.0.1, and Host and Origin both look right. The real
 * address is always https (`tailscale serve`), and a browser sends
 * Sec-Fetch-Site only from a secure page and lets no page set it, so an
 * http Origin, or no Sec-Fetch-Site, is refused, APP_HEADER or not.
 * This is not a login: a program on any device that can reach the tailnet
 * address can send these headers and run Lean as this user, so the tailnet's
 * membership and access rules decide who may. Never `tailscale funnel`. Pure.
 */
export function tailnetRequest(headers: Record<string, string | string[] | undefined>): boolean {
  const { origin } = headers;
  if (origin !== undefined && !(typeof origin === "string" && origin.startsWith("https://"))) return false;
  return headers["sec-fetch-site"] === "same-origin";
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

/** wrap()'s whole test: this machine, this origin, this app, and over the tailnet the stricter rule. Pure but for the configured names. */
export function mayCall(headers: { host?: string; origin?: string } & Record<string, string | string[] | undefined>, hosts: readonly string[] = configured): boolean {
  if (!localHost(headers.host, hosts) || !sameOrigin(headers.origin, headers.host) || !fromApp(headers)) return false;
  return loopbackHost(headers.host) || tailnetRequest(headers);
}
