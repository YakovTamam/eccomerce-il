import { z } from "zod";
import { pageInputSchema, pageSlugSchema } from "@/lib/blocks/schemas";

const iso = z.string().datetime();

export const pagePayloadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    slug: pageSlugSchema,
    input: pageInputSchema,
  }),
  z.object({
    action: z.literal("update"),
    pageId: z.string().uuid(),
    baseUpdatedAt: iso,
    input: pageInputSchema,
  }),
]);
export type PagePayload = z.infer<typeof pagePayloadSchema>;

export const discountPayloadSchema = z.object({
  input: z.object({
    code: z.string().min(3).max(32),
    type: z.enum(["percent", "fixed", "free_shipping"]),
    value: z.number().int().min(0).max(100_000_000),
    startsAt: iso.nullable().default(null),
    endsAt: iso.nullable().default(null),
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().default(null),
  }),
});
export type DiscountPayload = z.infer<typeof discountPayloadSchema>;

/** Partial product change. Variants are patched by id (price/stock edits); structure changes are out of scope. */
export const productChangesSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    descriptionMd: z.string().max(10_000).optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    variants: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            title: z.string().trim().min(1).max(120).optional(),
            sku: z.string().trim().max(64).nullable().optional(),
            priceAgorot: z.number().int().min(0).max(100_000_000).optional(),
            compareAtAgorot: z
              .number()
              .int()
              .min(0)
              .max(100_000_000)
              .nullable()
              .optional(),
            stockQty: z.number().int().min(0).max(1_000_000).optional(),
            trackStock: z.boolean().optional(),
          })
          .refine(
            (v) => Object.keys(v).length > 1,
            "variant patch has no changes",
          ),
      )
      .max(100)
      .optional(),
  })
  .refine((c) => Object.keys(c).length > 0, "no changes given");
export type ProductChanges = z.infer<typeof productChangesSchema>;

export const productUpdatePayloadSchema = z.object({
  productId: z.string().uuid(),
  baseUpdatedAt: iso,
  changes: productChangesSchema,
});

export const campaignPayloadSchema = z.object({
  name: z.string(),
  childIds: z.array(z.string().uuid()),
});
