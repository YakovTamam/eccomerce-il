import { and, eq, inArray } from "drizzle-orm";
import {
  carts,
  productVariants,
  products,
  stores,
  type CartItem,
} from "@/lib/db/schema";
import { withStore, type StoreTx } from "@/lib/db/with-store";
import type { Db } from "@/lib/db/client";
import { findDiscountByCode } from "@/lib/discounts/service";
import { readShipping, type ShippingSettings } from "@/lib/shipping/settings";
import {
  checkDiscount,
  computeTotals,
  DISCOUNT_MESSAGES,
  type DiscountRule,
  type ShippingMethod,
  type Totals,
} from "./pricing";

export const MAX_QTY_PER_LINE = 99;

export type CartLine = {
  variantId: string;
  productSlug: string;
  productTitle: string;
  variantTitle: string;
  imageUrl: string | null;
  imageAlt: string | null;
  unitPriceAgorot: number;
  qty: number;
  lineTotalAgorot: number;
  stockLeft: number | null; // null = not tracked
};

export type CartView = {
  id: string;
  lines: CartLine[];
  issues: string[]; // anything here blocks checkout
  discount: { code: string; rule: DiscountRule } | null;
  discountMessage: string | null;
  shippingMethod: ShippingMethod;
  shippingSettings: ShippingSettings;
  totals: Totals;
  itemCount: number;
};

export class CartError extends Error {}

async function loadOpenCart(tx: StoreTx, cartId: string) {
  const [c] = await tx
    .select()
    .from(carts)
    .where(and(eq(carts.id, cartId), eq(carts.status, "open")))
    .for("update");
  return c ?? null;
}

/** Builds the priced view. Prices/stock/discounts always come from the DB, never from the client. */
export async function buildCartView(
  tx: StoreTx,
  cart: typeof carts.$inferSelect,
): Promise<CartView> {
  const [store] = await tx
    .select({ settings: stores.settings })
    .from(stores)
    .limit(1);
  const shippingSettings = readShipping(store?.settings);
  const items = cart.items as CartItem[];
  const ids = items.map((i) => i.variantId);

  const rows = ids.length
    ? await tx
        .select({
          variantId: productVariants.id,
          variantTitle: productVariants.title,
          price: productVariants.priceAgorot,
          stockQty: productVariants.stockQty,
          trackStock: productVariants.trackStock,
          productTitle: products.title,
          productSlug: products.slug,
          images: products.images,
          status: products.status,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(inArray(productVariants.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.variantId, r]));

  const issues: string[] = [];
  const lines: CartLine[] = [];
  for (const it of items) {
    const r = byId.get(it.variantId);
    if (!r || r.status !== "active") {
      issues.push("אחד המוצרים בעגלה אינו זמין עוד והוסר מהחישוב");
      continue;
    }
    const stockLeft = r.trackStock ? r.stockQty : null;
    if (stockLeft !== null && it.qty > stockLeft) {
      issues.push(
        stockLeft === 0
          ? `"${r.productTitle}" אזל מהמלאי`
          : `"${r.productTitle}": נותרו ${stockLeft} יחידות בלבד`,
      );
    }
    lines.push({
      variantId: it.variantId,
      productSlug: r.productSlug,
      productTitle: r.productTitle,
      variantTitle: r.variantTitle,
      imageUrl: r.images[0]?.url ?? null,
      imageAlt: r.images[0]?.alt ?? null,
      unitPriceAgorot: r.price,
      qty: it.qty,
      lineTotalAgorot: r.price * it.qty,
      stockLeft,
    });
  }

  let discount: CartView["discount"] = null;
  let discountMessage: string | null = null;
  if (cart.discountCode) {
    const check = checkDiscount(
      await findDiscountByCode(tx, cart.discountCode),
    );
    if (check.ok) discount = { code: cart.discountCode, rule: check.rule };
    else discountMessage = DISCOUNT_MESSAGES[check.reason];
  }

  const shippingMethod: ShippingMethod =
    cart.shippingMethod ??
    (shippingSettings.pickupEnabled ? "pickup" : "delivery");
  const totals = computeTotals({
    lines: lines.map((l) => ({
      variantId: l.variantId,
      unitPriceAgorot: l.unitPriceAgorot,
      qty: l.qty,
    })),
    shippingMethod,
    shipping: shippingSettings,
    discount: discount?.rule ?? null,
  });
  return {
    id: cart.id,
    lines,
    issues,
    discount,
    discountMessage,
    shippingMethod,
    shippingSettings,
    totals,
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
  };
}

export function getCartView(storeId: string, cartId: string, db?: Db) {
  return withStore(
    storeId,
    async (tx) => {
      const [c] = await tx
        .select()
        .from(carts)
        .where(and(eq(carts.id, cartId), eq(carts.status, "open")));
      return c ? buildCartView(tx, c) : null;
    },
    db,
  );
}

/** Adds qty of a variant; creates the cart when `cartId` is missing/closed. Returns the cart id. */
export function addToCart(
  storeId: string,
  cartId: string | null,
  variantId: string,
  qty: number,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE)
        throw new CartError("כמות לא תקינה");
      const [v] = await tx
        .select({
          stockQty: productVariants.stockQty,
          trackStock: productVariants.trackStock,
          status: products.status,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(eq(productVariants.id, variantId));
      if (!v || v.status !== "active") throw new CartError("המוצר אינו זמין");

      let cart = cartId ? await loadOpenCart(tx, cartId) : null;
      if (!cart) {
        [cart] = await tx
          .insert(carts)
          .values({
            storeId,
            channel: "web",
            expiresAt: new Date(Date.now() + 30 * 86_400_000),
          })
          .returning();
      }
      const items = [...(cart.items as CartItem[])];
      const existing = items.find((i) => i.variantId === variantId);
      const newQty = Math.min((existing?.qty ?? 0) + qty, MAX_QTY_PER_LINE);
      if (v.trackStock && newQty > v.stockQty) {
        throw new CartError(
          v.stockQty === 0
            ? "המוצר אזל מהמלאי"
            : `ניתן להזמין עד ${v.stockQty} יחידות`,
        );
      }
      if (existing) existing.qty = newQty;
      else items.push({ variantId, qty: newQty });
      await tx
        .update(carts)
        .set({ items, updatedAt: new Date() })
        .where(eq(carts.id, cart.id));
      return cart.id;
    },
    db,
  );
}

/** qty 0 removes the line. */
export function setCartQty(
  storeId: string,
  cartId: string,
  variantId: string,
  qty: number,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY_PER_LINE)
        throw new CartError("כמות לא תקינה");
      const cart = await loadOpenCart(tx, cartId);
      if (!cart) throw new CartError("העגלה לא נמצאה");
      const items = (cart.items as CartItem[]).flatMap((i) =>
        i.variantId !== variantId ? [i] : qty === 0 ? [] : [{ ...i, qty }],
      );
      await tx
        .update(carts)
        .set({ items, updatedAt: new Date() })
        .where(eq(carts.id, cart.id));
    },
    db,
  );
}

export function applyCartDiscount(
  storeId: string,
  cartId: string,
  code: string,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const cart = await loadOpenCart(tx, cartId);
      if (!cart) throw new CartError("העגלה לא נמצאה");
      const normalized = code.trim().toUpperCase();
      const check = checkDiscount(await findDiscountByCode(tx, normalized));
      if (!check.ok) throw new CartError(DISCOUNT_MESSAGES[check.reason]);
      await tx
        .update(carts)
        .set({ discountCode: normalized, updatedAt: new Date() })
        .where(eq(carts.id, cartId));
    },
    db,
  );
}

export function clearCartDiscount(storeId: string, cartId: string, db?: Db) {
  return withStore(
    storeId,
    async (tx) => {
      await tx
        .update(carts)
        .set({ discountCode: null, updatedAt: new Date() })
        .where(and(eq(carts.id, cartId), eq(carts.status, "open")));
    },
    db,
  );
}

export function setCartShipping(
  storeId: string,
  cartId: string,
  method: ShippingMethod,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      await tx
        .update(carts)
        .set({ shippingMethod: method, updatedAt: new Date() })
        .where(and(eq(carts.id, cartId), eq(carts.status, "open")));
    },
    db,
  );
}
