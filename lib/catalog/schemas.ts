import { z } from "zod";
import { shekelsToAgorot } from "./money";

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

export const imageSchema = z.object({
  // Our own upload URLs: relative (/uploads/...) in dev, https in Blob.
  url: z
    .string()
    .min(1)
    .refine(
      (u) => u.startsWith("/uploads/") || u.startsWith("https://"),
      "כתובת תמונה לא תקינה",
    ),
  alt: z.string().trim().min(1, "חובה להזין תיאור (alt) לכל תמונה").max(200),
});

export const variantSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z
    .preprocess(emptyToNull, z.string().trim().max(64).nullable())
    .default(null),
  title: z.string().trim().min(1, "נא להזין שם לוריאציה").max(120),
  options: z.record(z.string().max(40), z.string().max(80)).default({}),
  priceAgorot: z
    .number()
    .int("המחיר חייב להיות במספר שלם של אגורות")
    .min(0)
    .max(100_000_000),
  compareAtAgorot: z
    .number()
    .int()
    .min(0)
    .max(100_000_000)
    .nullable()
    .default(null),
  stockQty: z.number().int().min(0, "המלאי לא יכול להיות שלילי").max(1_000_000),
  trackStock: z.boolean().default(true),
});

export const productSchema = z
  .object({
    title: z.string().trim().min(2, "נא להזין שם מוצר").max(200),
    descriptionMd: z.string().max(10_000).default(""),
    status: z.enum(["draft", "active", "archived"]).default("draft"),
    categoryId: z.string().uuid().nullable().default(null),
    images: z.array(imageSchema).max(10, "עד 10 תמונות").default([]),
    variants: z.array(variantSchema).min(1, "נדרשת לפחות וריאציה אחת").max(100),
  })
  .superRefine((p, ctx) => {
    const skus = p.variants.map((v) => v.sku).filter((s): s is string => !!s);
    if (new Set(skus).size !== skus.length) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: 'מק"ט כפול בין הוריאציות',
      });
    }
    p.variants.forEach((v, i) => {
      if (v.compareAtAgorot !== null && v.compareAtAgorot <= v.priceAgorot) {
        ctx.addIssue({
          code: "custom",
          path: ["variants", i, "compareAtAgorot"],
          message: "מחיר לפני הנחה חייב להיות גבוה מהמחיר",
        });
      }
    });
  });

export type ProductInput = z.infer<typeof productSchema>;
export type VariantInput = z.infer<typeof variantSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(2, "נא להזין שם קטגוריה").max(80),
});

/**
 * The product form posts a JSON payload whose prices are strings in shekels.
 * Convert to agorot (integer math) at this boundary, then validate with Zod.
 */
export function parseProductForm(
  raw: unknown,
): { ok: true; data: ProductInput } | { ok: false; error: string } {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, error: "נתוני הטופס פגומים" };
    }
  }
  if (typeof obj !== "object" || obj === null)
    return { ok: false, error: "נתוני הטופס פגומים" };
  const o = obj as Record<string, unknown>;
  const variants = Array.isArray(o.variants) ? o.variants : [];
  const converted = {
    ...o,
    variants: variants.map((v: Record<string, unknown>) => {
      const price = shekelsToAgorot(String(v.price ?? ""));
      const cmpRaw = String(v.compareAt ?? "").trim();
      const cmp = cmpRaw === "" ? null : shekelsToAgorot(cmpRaw);
      return {
        id: v.id || undefined,
        sku: v.sku,
        title: v.title,
        options: v.options ?? {},
        priceAgorot: price ?? Number.NaN,
        compareAtAgorot: cmp === null && cmpRaw !== "" ? Number.NaN : cmp,
        stockQty: Number(v.stockQty ?? Number.NaN),
        trackStock: v.trackStock !== false,
      };
    }),
  };
  const res = productSchema.safeParse(converted);
  if (!res.success) {
    const issue = res.error.issues[0];
    const isNum =
      issue.code === "invalid_type" &&
      issue.path.some((p) => p === "priceAgorot" || p === "stockQty");
    return {
      ok: false,
      error: isNum
        ? "נא להזין מחיר ומלאי תקינים (מחיר עד שתי ספרות אחרי הנקודה)"
        : issue.message,
    };
  }
  return { ok: true, data: res.data };
}
