const dev = process.env.NODE_ENV !== "production";

/** Canonical origin of a store: verified primary custom domain, else <slug>.<ROOT_DOMAIN>. */
export function storeBaseUrl(store: {
  slug: string;
  primaryDomain: string | null;
}): string {
  if (store.primaryDomain) return `https://${store.primaryDomain}`;
  if (dev) return `http://${store.slug}.localhost:3000`;
  const root = process.env.ROOT_DOMAIN ?? "xn--4dbklvp7aj.xn--4dbrk0ce";
  return `https://${store.slug}.${root}`;
}
