import fs from "node:fs";
import { envFile, parseEnv } from "../../scripts/env.mjs";

// LEAN_PUBLIC_HOST: the owner's own Tailscale name(s), which
// `tailscale serve` answers under (CLAUDE.md, the 2026-11-24 exception).
// Read here, checked here, and handed to Vite and origin.ts by
// vite.config.ts. Never written back to process.env: a value put there would
// outrank the file when Vite restarts itself, so a name taken out of
// .env.local would go on being accepted.

/** A MagicDNS name: dot-separated labels ending in .ts.net. No scheme, port, path or wildcard (Vite reads a leading dot as "and every subdomain"). */
const TAILNET_NAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/;

/** The names in a comma-separated list, lower-cased; `warn` is told of each entry dropped. Pure. */
export function parsePublicHosts(value: string, warn: (entry: string) => void = () => {}): string[] {
  const hosts = new Set<string>();
  for (const raw of value.split(",")) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    if (TAILNET_NAME.test(name)) hosts.add(name);
    else warn(raw.trim());
  }
  return [...hosts];
}

/** The shell's LEAN_PUBLIC_HOST when it is set at all (set but empty means off), else the env file's. No file, no name: only localhost. */
export function readPublicHosts(env: NodeJS.ProcessEnv = process.env, file: string = envFile(), warn?: (entry: string) => void): string[] {
  let value = env.LEAN_PUBLIC_HOST;
  if (value === undefined) {
    try {
      value = parseEnv(fs.readFileSync(file, "utf8")).LEAN_PUBLIC_HOST;
    } catch {
      /* no file: no public host */
    }
  }
  return parsePublicHosts(value ?? "", warn);
}
