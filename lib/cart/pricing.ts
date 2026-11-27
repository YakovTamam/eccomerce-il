import type { ShippingSettings } from "@/lib/shipping/settings";

/** Pure money math. Everything is an integer number of agorot; prices include VAT. */

export type PricedLine = {
  variantId: string;
  unitPriceAgorot: number;
  qty: number;
};
export type DiscountRule = {
  code: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
};
export type ShippingMethod = "pickup" | "delivery";

export type Totals = {
  subtotalAgorot: number;
  discountAgorot: number;
  shippingAgorot: number;
  totalAgorot: number;
  freeShipping: boolean;
};

export function computeTotals(input: {
  lines: PricedLine[];
  shippingMethod: ShippingMethod;
  shipping: ShippingSettings;
  discount: DiscountRule | null;
}): Totals {
  const subtotal = input.lines.reduce(
    (sum, l) => sum + l.unitPriceAgorot * l.qty,
    0,
  );

  let discount = 0;
  if (input.discount?.type === "percent")
    discount = Math.floor((subtotal * input.discount.value) / 100);
  if (input.discount?.type === "fixed")
    discount = Math.min(input.discount.value, subtotal);

  const afterDiscount = subtotal - discount;
  let shipping = 0;
  let freeShipping = false;
  if (input.shippingMethod === "delivery") {
    const freeByCoupon = input.discount?.type === "free_shipping";
    const freeByAmount =
      input.shipping.freeOverAgorot !== null &&
      afterDiscount >= input.shipping.freeOverAgorot;
    freeShipping = freeByCoupon || freeByAmount;
    shipping = freeShipping ? 0 : input.shipping.flatRateAgorot;
  }
  return {
    subtotalAgorot: subtotal,
    discountAgorot: discount,
    shippingAgorot: shipping,
    totalAgorot: afterDiscount + shipping,
    freeShipping,
  };
}

/** VAT contained in a VAT-inclusive total. `rateBp` in basis points (1800 = 18%). */
export function vatIncluded(totalAgorot: number, rateBp: number): number {
  return totalAgorot - Math.round((totalAgorot * 10_000) / (10_000 + rateBp));
}

/** "0.180" (DB numeric string) → 1800 */
export function vatRateToBp(rate: string): number {
  const [whole, frac = ""] = rate.split(".");
  return Number(whole) * 10_000 + Number(frac.padEnd(4, "0").slice(0, 4));
}

export type DiscountRow = {
  code: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  status: "active" | "disabled";
};

export type DiscountCheck =
  | { ok: true; rule: DiscountRule }
  | {
      ok: false;
      reason:
        "not_found" | "inactive" | "not_started" | "expired" | "exhausted";
    };

export function checkDiscount(
  row: DiscountRow | null,
  now = new Date(),
): DiscountCheck {
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "active") return { ok: false, reason: "inactive" };
  if (row.startsAt && row.startsAt > now)
    return { ok: false, reason: "not_started" };
  if (row.endsAt && row.endsAt < now) return { ok: false, reason: "expired" };
  if (row.usageLimit !== null && row.usedCount >= row.usageLimit)
    return { ok: false, reason: "exhausted" };
  return {
    ok: true,
    rule: { code: row.code, type: row.type, value: row.value },
  };
}

export const DISCOUNT_MESSAGES: Record<
  Exclude<DiscountCheck, { ok: true }>["reason"],
  string
> = {
  not_found: "קוד הקופון לא קיים",
  inactive: "הקופון אינו פעיל",
  not_started: "הקופון עדיין לא בתוקף",
  expired: "תוקף הקופון הסתיים",
  exhausted: "הקופון מוצה",
};
