import { isValidSlug } from "./slug";

export type HostTarget =
  | { kind: "platform" } // marketing site on the root domain
  | { kind: "app" } // dashboard: app.<root>
  | { kind: "store"; slug: string } // <slug>.<root>
  | { kind: "custom"; hostname: string } // private domain, resolved via store_domains
  | { kind: "notfound" };

/** lowercase, no port / trailing dot, IDN → Punycode (the URL parser does the latter). */
export function normalizeHost(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    return new URL(`http://${trimmed}`).hostname.replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function resolveHost(
  rawHost: string,
  rootDomains: string[],
): HostTarget {
  const host = normalizeHost(rawHost);
  if (!host) return { kind: "notfound" };

  // IP literals and Vercel preview URLs serve the platform site.
  if (
    host.startsWith("[") ||
    /^\d+(\.\d+){3}$/.test(host) ||
    host.endsWith(".vercel.app")
  ) {
    return { kind: "platform" };
  }

  const roots = rootDomains.map(normalizeHost).filter(Boolean);
  for (const root of roots) {
    if (host === root) return { kind: "platform" };
    if (host.endsWith(`.${root}`)) {
      const label = host.slice(0, -(root.length + 1));
      if (label.includes(".")) return { kind: "notfound" };
      if (label === "app") return { kind: "app" };
      if (label === "www") return { kind: "platform" };
      return isValidSlug(label)
        ? { kind: "store", slug: label }
        : { kind: "notfound" };
    }
  }
  return { kind: "custom", hostname: host };
}

export function getRootDomains(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return [env.ROOT_DOMAIN, env.ALT_ROOT_DOMAIN, "localhost"].filter(
    (d): d is string => !!d,
  );
}
