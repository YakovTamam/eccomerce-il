"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addToCart,
  applyCartDiscount,
  CartError,
  clearCartDiscount,
  setCartQty,
  setCartShipping,
} from "@/lib/cart/service";
import {
  checkoutInputSchema,
  CheckoutError,
  createOrderFromCart,
  startPayment,
} from "@/lib/orders/checkout";
import {
  currentBaseUrl,
  currentStore,
  readCartId,
  writeCartId,
} from "@/lib/storefront/tenant";

export type CartState = { error?: string };

const uuid = z.string().uuid();

export async function addToCartAction(
  _p: CartState,
  fd: FormData,
): Promise<CartState> {
  const store = await currentStore();
  const variantId = uuid.safeParse(fd.get("variantId"));
  const qty = z.coerce.number().int().safeParse(fd.get("qty"));
  if (!variantId.success || !qty.success)
    return { error: "נא לבחור אפשרות וכמות" };
  try {
    const id = await addToCart(
      store.id,
      await readCartId(),
      variantId.data,
      qty.data,
    );
    await writeCartId(id);
  } catch (e) {
    if (e instanceof CartError) return { error: e.message };
    throw e;
  }
  redirect("/cart");
}

async function withCart(
  fn: (storeId: string, cartId: string) => Promise<void>,
) {
  const store = await currentStore();
  const cartId = await readCartId();
  if (cartId) await fn(store.id, cartId);
}

export async function updateQtyAction(fd: FormData) {
  const variantId = uuid.safeParse(fd.get("variantId"));
  const qty = z.coerce.number().int().safeParse(fd.get("qty"));
  if (!variantId.success || !qty.success) return;
  await withCart(async (s, c) => {
    try {
      await setCartQty(s, c, variantId.data, qty.data);
    } catch (e) {
      if (!(e instanceof CartError)) throw e;
    }
  });
  redirect("/cart");
}

export async function applyCouponAction(
  _p: CartState,
  fd: FormData,
): Promise<CartState> {
  const code = z.string().trim().min(1).max(40).safeParse(fd.get("code"));
  if (!code.success) return { error: "נא להזין קוד קופון" };
  const store = await currentStore();
  const cartId = await readCartId();
  if (!cartId) return { error: "העגלה ריקה" };
  try {
    await applyCartDiscount(store.id, cartId, code.data);
  } catch (e) {
    if (e instanceof CartError) return { error: e.message };
    throw e;
  }
  redirect("/cart");
}

export async function removeCouponAction() {
  await withCart((s, c) => clearCartDiscount(s, c));
  redirect("/cart");
}

export async function setShippingAction(fd: FormData) {
  const m = z.enum(["pickup", "delivery"]).safeParse(fd.get("shippingMethod"));
  if (m.success) await withCart((s, c) => setCartShipping(s, c, m.data));
  redirect("/cart");
}

export async function checkoutAction(
  _p: CartState,
  fd: FormData,
): Promise<CartState> {
  const store = await currentStore();
  const cartId = await readCartId();
  if (!cartId) return { error: "העגלה ריקה" };

  const parsed = checkoutInputSchema.safeParse({
    name: fd.get("name"),
    phone: fd.get("phone"),
    email: fd.get("email") ?? "",
    marketingOptIn: fd.get("marketingOptIn") === "on",
    shippingMethod: fd.get("shippingMethod"),
    address:
      fd.get("shippingMethod") === "delivery"
        ? {
            street: fd.get("street") ?? "",
            city: fd.get("city") ?? "",
            zip: fd.get("zip") || undefined,
            notes: fd.get("addressNotes") || undefined,
          }
        : null,
    notes: fd.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let payUrl: string;
  try {
    const order = await createOrderFromCart(store.id, cartId, parsed.data);
    payUrl = await startPayment(store.id, order, await currentBaseUrl(store));
  } catch (e) {
    if (e instanceof CheckoutError)
      return { error: [e.message, ...e.issues].join(" · ") };
    console.error("checkout failed", e);
    return { error: "לא הצלחנו להתחיל את התשלום. נסו שוב בעוד רגע." };
  }
  redirect(payUrl); // provider-hosted payment page: card details never touch our servers
}
