import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { discounts } from "@/lib/db/schema";
import { withStore, type StoreTx } from "@/lib/db/with-store";
import type { Db } from "@/lib/db/client";
import type { DiscountRow } from "@/lib/cart/pricing";

export const discountInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z0-9_-]{3,32}$/,
        "קוד: 3–32 תווים, אותיות לטיניות, ספרות, מקף וקו תחתון",
      ),
    type: z.enum(["percent", "fixed", "free_shipping"]),
    value: z.number().int().min(0).max(100_000_000),
    startsAt: z.date().nullable().default(null),
    endsAt: z.date().nullable().default(null),
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().default(null),
  })
  .superRefine((d, ctx) => {
    if (d.type === "percent" && (d.value < 1 || d.value > 100))
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "אחוז הנחה בין 1 ל-100",
      });
    if (d.type === "fixed" && d.value < 1)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "סכום ההנחה חייב להיות חיובי",
      });
    if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt)
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "תאריך הסיום חייב להיות אחרי ההתחלה",
      });
  });
export type DiscountInput = z.infer<typeof discountInputSchema>;

export class DiscountCodeTakenError extends Error {}

export const findDiscountByCode = async (
  tx: StoreTx,
  code: string,
): Promise<DiscountRow | null> => {
  const [d] = await tx
    .select()
    .from(discounts)
    .where(eq(discounts.code, code.trim().toUpperCase()));
  return d ?? null;
};

export function createDiscount(storeId: string, input: DiscountInput, db?: Db) {
  return withStore(
    storeId,
    async (tx) => {
      if (await findDiscountByCode(tx, input.code))
        throw new DiscountCodeTakenError();
      const [d] = await tx
        .insert(discounts)
        .values({ storeId, ...input })
        .returning();
      return d;
    },
    db,
  );
}

export const listDiscounts = (storeId: string, db?: Db) =>
  withStore(
    storeId,
    (tx) => tx.select().from(discounts).orderBy(desc(discounts.createdAt)),
    db,
  );

export const setDiscountStatus = (
  storeId: string,
  id: string,
  status: "active" | "disabled",
  db?: Db,
) =>
  withStore(
    storeId,
    (tx) => tx.update(discounts).set({ status }).where(eq(discounts.id, id)),
    db,
  );
