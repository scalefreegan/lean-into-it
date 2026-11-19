// Who may call the API: this machine, from this app's own pages. A leaf
// module (no imports), so any route can use it without a cycle; api.ts
// applies both in wrap().

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
 */
export function localHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, "").toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}
