import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";
import {
  checkDiscount,
  computeTotals,
  vatIncluded,
  vatRateToBp,
  type DiscountRow,
} from "@/lib/cart/pricing";
import { shippingSettingsSchema, readShipping } from "@/lib/shipping/settings";
import { canTransition, manualTargets } from "@/lib/orders/status";

const ship = shippingSettingsSchema.parse({});
const lines = [
  { variantId: "a", unitPriceAgorot: 2000, qty: 2 }, // 40.00
  { variantId: "b", unitPriceAgorot: 3550, qty: 1 }, // 35.50
];

describe("normalizePhone", () => {
  it.each([
    ["050-123-4567", "+972501234567"],
    ["0501234567", "+972501234567"],
    ["+972 50 123 4567", "+972501234567"],
    ["972501234567", "+972501234567"],
    ["00972501234567", "+972501234567"],
    ["03-1234567", "+97231234567"],
    ["+14155552671", "+14155552671"],
  ])("%s → %s", (i, o) => expect(normalizePhone(i)).toBe(o));
  it.each(["", "abc", "123", "050123", "+972 1 123 4567", "1234567890"])(
    "rejects %j",
    (i) => expect(normalizePhone(i)).toBeNull(),
  );
});

describe("computeTotals (integer agorot)", () => {
  it("pickup has no shipping", () => {
    expect(
      computeTotals({
        lines,
        shippingMethod: "pickup",
        shipping: ship,
        discount: null,
      }),
    ).toEqual({
      subtotalAgorot: 7550,
      discountAgorot: 0,
      shippingAgorot: 0,
      totalAgorot: 7550,
      freeShipping: false,
    });
  });
  it("delivery adds flat rate below the free threshold, free at/above it", () => {
    const d = computeTotals({
      lines,
      shippingMethod: "delivery",
      shipping: ship,
      discount: null,
    });
    expect([d.shippingAgorot, d.totalAgorot]).toEqual([3000, 10550]);
    const big = computeTotals({
      lines: [{ variantId: "a", unitPriceAgorot: 25000, qty: 1 }],
      shippingMethod: "delivery",
      shipping: ship,
      discount: null,
    });
    expect([big.shippingAgorot, big.freeShipping]).toEqual([0, true]);
  });
  it("percent discount floors to whole agorot; never negative; fixed capped at subtotal", () => {
    const p = computeTotals({
      lines: [{ variantId: "a", unitPriceAgorot: 999, qty: 1 }],
      shippingMethod: "pickup",
      shipping: ship,
      discount: { code: "X", type: "percent", value: 15 },
    });
    expect(p.discountAgorot).toBe(149); // floor(149.85)
    expect(p.totalAgorot).toBe(850);
    const f = computeTotals({
      lines,
      shippingMethod: "pickup",
      shipping: ship,
      discount: { code: "X", type: "fixed", value: 999999 },
    });
    expect([f.discountAgorot, f.totalAgorot]).toEqual([7550, 0]);
  });
  it("discount applies before the free-shipping threshold; free_shipping coupon zeroes shipping", () => {
    const t = computeTotals({
      lines: [{ variantId: "a", unitPriceAgorot: 26000, qty: 1 }],
      shippingMethod: "delivery",
      shipping: ship,
      discount: { code: "X", type: "percent", value: 10 },
    });
    expect(t.shippingAgorot).toBe(3000); // 26000-2600=23400 < 25000
    const fs = computeTotals({
      lines,
      shippingMethod: "delivery",
      shipping: ship,
      discount: { code: "FS", type: "free_shipping", value: 0 },
    });
    expect(fs.shippingAgorot).toBe(0);
  });
  it("all results are integers", () => {
    const t = computeTotals({
      lines: [{ variantId: "a", unitPriceAgorot: 3333, qty: 7 }],
      shippingMethod: "delivery",
      shipping: ship,
      discount: { code: "X", type: "percent", value: 33 },
    });
    for (const v of [
      t.subtotalAgorot,
      t.discountAgorot,
      t.shippingAgorot,
      t.totalAgorot,
    ])
      expect(Number.isInteger(v)).toBe(true);
  });
});

describe("VAT", () => {
  it("extracts VAT from an inclusive total", () => {
    expect(vatRateToBp("0.180")).toBe(1800);
    expect(vatIncluded(11800, 1800)).toBe(1800);
    expect(vatIncluded(0, 1800)).toBe(0);
  });
});

describe("checkDiscount", () => {
  const row: DiscountRow = {
    code: "SAVE",
    type: "percent",
    value: 10,
    startsAt: null,
    endsAt: null,
    usageLimit: 2,
    usedCount: 0,
    status: "active",
  };
  const now = new Date("2030-06-01T00:00:00Z");
  it("validates window, status and usage", () => {
    expect(checkDiscount(row, now).ok).toBe(true);
    expect(checkDiscount(null, now)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(checkDiscount({ ...row, status: "disabled" }, now)).toEqual({
      ok: false,
      reason: "inactive",
    });
    expect(
      checkDiscount({ ...row, startsAt: new Date("2031-01-01") }, now),
    ).toEqual({ ok: false, reason: "not_started" });
    expect(
      checkDiscount({ ...row, endsAt: new Date("2029-01-01") }, now),
    ).toEqual({ ok: false, reason: "expired" });
    expect(checkDiscount({ ...row, usedCount: 2 }, now)).toEqual({
      ok: false,
      reason: "exhausted",
    });
  });
});

describe("shipping settings & order status machine", () => {
  it("falls back to defaults on bad settings", () => {
    expect(
      readShipping({ shipping: { flatRateAgorot: -5 } }).flatRateAgorot,
    ).toBe(3000);
    expect(readShipping(null).freeOverAgorot).toBe(25000);
  });
  it("only allows sane transitions; paid/refunded are never manual", () => {
    expect(canTransition("pending_payment", "paid")).toBe(true);
    expect(canTransition("cancelled", "paid")).toBe(false);
    expect(canTransition("refunded", "completed")).toBe(false);
    expect(manualTargets("pending_payment")).toEqual(["cancelled"]);
    expect(manualTargets("paid")).not.toContain("refunded");
    expect(manualTargets("paid")).not.toContain("paid");
  });
});
