import { z } from "zod";

/** Labels that can never be a store slug (they map to platform subdomains). */
export const RESERVED_SLUGS = new Set([
  "app",
  "www",
  "mcp",
  "api",
  "admin",
  "mail",
  "static",
  "assets",
  "cdn",
  "status",
  "docs",
  "blog",
  "help",
  "support",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "הכתובת קצרה מדי (לפחות 3 תווים)")
  .max(40, "הכתובת ארוכה מדי")
  .refine((s) => SLUG_RE.test(s), "אותיות לטיניות קטנות, ספרות ומקף בלבד")
  .refine((s) => !RESERVED_SLUGS.has(s), "הכתובת הזו שמורה");
