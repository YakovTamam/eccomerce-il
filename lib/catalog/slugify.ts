import { randomBytes } from "node:crypto";

/** Latin-only slug; non-Latin titles (e.g. Hebrew) get a random "p-xxxxxxxx" slug. */
export function productSlug(title: string, suffix = false): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  const rand = randomBytes(4).toString("hex");
  if (!base) return `p-${rand}`;
  return suffix ? `${base}-${rand}` : base;
}
