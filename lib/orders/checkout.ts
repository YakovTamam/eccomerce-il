import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  carts,
  customers,
  orderItems,
  orders,
  payments,
  storeCounters,
  stores,
} from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import type { Db } from "@/lib/db/client";
import { buildCartView } from "@/lib/cart/service";
import { vatRateToBp } from "@/lib/cart/pricing";
import { normalizePhone } from "@/lib/phone";
import { getPaymentProvider, appOrigin } from "@/lib/payments";

export class CheckoutError extends Error {
  constructor(
    message: string,
    public issues: string[] = [],
  ) {
    super(message);
  }
}

export const checkoutInputSchema = z
  .object({
    name: z.string().trim().min(2, "נא להזין שם מלא").max(100),
    phone: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const n = normalizePhone(v);
        if (!n) ctx.addIssue({ code: "custom", message: "מספר טלפון לא תקין" });
        return n ?? "";
      }),
    email: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v === "" ? null : v))
      .pipe(z.string().email("כתובת אימייל לא תקינה").nullable()),
    marketingOptIn: z.boolean().default(false),
    shippingMethod: z.enum(["pickup", "delivery"]),
    address: z
      .object({
        street: z.string().trim().max(150),
        city: z.string().trim().max(80),
        zip: z.string().trim().max(10).optional(),
        notes: z.string().trim().max(200).optional(),
      })
      .nullable()
      .default(null),
    notes: z.string().trim().max(500).default(""),
  })
  .superRefine((v, ctx) => {
    if (
      v.shippingMethod === "delivery" &&
      (!v.address || v.address.street.length < 2 || v.address.city.length < 2)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["address"],
        message: "נא להזין כתובת למשלוח (רחוב ועיר)",
      });
    }
  });
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

/** Creates a `pending_payment` order from the open cart, atomically, with server-side prices. */
export function createOrderFromCart(
  storeId: string,
  cartId: string,
  input: CheckoutInput,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const [cart] = await tx
        .select()
        .from(carts)
        .where(and(eq(carts.id, cartId), eq(carts.status, "open")))
        .for("update");
      if (!cart || (cart.items as unknown[]).length === 0)
        throw new CheckoutError("העגלה ריקה");

      const view = await buildCartView(tx, {
        ...cart,
        shippingMethod: input.shippingMethod,
      });
      if (view.issues.length)
        throw new CheckoutError("יש בעיה בעגלה", view.issues);
      if (
        input.shippingMethod === "pickup" &&
        !view.shippingSettings.pickupEnabled
      )
        throw new CheckoutError("איסוף עצמי אינו זמין");
      if (
        input.shippingMethod === "delivery" &&
        !view.shippingSettings.deliveryEnabled
      )
        throw new CheckoutError("משלוח אינו זמין");
      if (view.totals.totalAgorot <= 0)
        throw new CheckoutError("סכום ההזמנה חייב להיות חיובי");

      const [store] = await tx
        .select({ vatRate: stores.vatRate })
        .from(stores)
        .limit(1);

      // customer: find-or-create by phone; consent is recorded only when given.
      const now = new Date();
      const [existing] = await tx
        .select()
        .from(customers)
        .where(eq(customers.phoneE164, input.phone));
      let customerId: string;
      if (existing) {
        customerId = existing.id;
        await tx
          .update(customers)
          .set({
            name: input.name,
            email: input.email ?? existing.email,
            ...(input.marketingOptIn && !existing.marketingOptIn
              ? { marketingOptIn: true, optInAt: now }
              : {}),
          })
          .where(eq(customers.id, existing.id));
      } else {
        const [c] = await tx
          .insert(customers)
          .values({
            storeId,
            name: input.name,
            phoneE164: input.phone,
            email: input.email,
            marketingOptIn: input.marketingOptIn,
            optInAt: input.marketingOptIn ? now : null,
          })
          .returning({ id: customers.id });
        customerId = c.id;
      }

      // A re-checkout of the same cart supersedes earlier unpaid orders.
      await tx
        .update(orders)
        .set({ status: "cancelled" })
        .where(
          and(eq(orders.cartId, cartId), eq(orders.status, "pending_payment")),
        );

      // Per-store running order number (atomic upsert).
      const [counter] = await tx
        .insert(storeCounters)
        .values({ storeId, name: "order", value: 1 })
        .onConflictDoUpdate({
          target: [storeCounters.storeId, storeCounters.name],
          set: { value: sql`${storeCounters.value} + 1` },
        })
        .returning({ value: storeCounters.value });

      const [order] = await tx
        .insert(orders)
        .values({
          storeId,
          number: counter.value,
          customerId,
          cartId,
          channel: "web",
          status: "pending_payment",
          subtotalAgorot: view.totals.subtotalAgorot,
          discountAgorot: view.totals.discountAgorot,
          shippingAgorot: view.totals.shippingAgorot,
          totalAgorot: view.totals.totalAgorot,
          vatRateBp: vatRateToBp(store.vatRate),
          discountCode: view.discount?.code ?? null,
          shippingMethod: input.shippingMethod,
          shippingAddress:
            input.shippingMethod === "delivery" ? input.address : null,
          notes: input.notes,
        })
        .returning();

      await tx.insert(orderItems).values(
        view.lines.map((l) => ({
          storeId,
          orderId: order.id,
          variantId: l.variantId,
          titleSnapshot:
            l.variantTitle === "ברירת מחדל" || l.variantTitle === "רגיל"
              ? l.productTitle
              : `${l.productTitle} — ${l.variantTitle}`,
          unitPriceAgorot: l.unitPriceAgorot,
          qty: l.qty,
        })),
      );
      return {
        orderId: order.id,
        number: order.number,
        totalAgorot: order.totalAgorot,
        customer: { name: input.name, email: input.email, phone: input.phone },
      };
    },
    db,
  );
}

/** Opaque id sent to the payment provider; lets the webhook find the store without trusting the client. */
export const paymentOrderRef = (storeId: string, orderId: string) =>
  `${storeId}:${orderId}`;

export function parsePaymentOrderRef(
  ref: string,
): { storeId: string; orderId: string } | null {
  const [storeId, orderId, ...rest] = ref.split(":");
  const u = z.string().uuid();
  if (
    rest.length ||
    !u.safeParse(storeId).success ||
    !u.safeParse(orderId).success
  )
    return null;
  return { storeId, orderId };
}

/** Asks the provider for a hosted payment page (card data never touches us) and records a pending payment. */
export async function startPayment(
  storeId: string,
  order: {
    orderId: string;
    totalAgorot: number;
    customer: { name: string; email: string | null; phone: string };
  },
  storeBaseUrl: string,
  db?: Db,
) {
  const provider = getPaymentProvider();
  const origin = appOrigin();
  const res = await provider.createHostedPayment({
    orderId: paymentOrderRef(storeId, order.orderId),
    amountAgorot: order.totalAgorot,
    customer: {
      name: order.customer.name,
      email: order.customer.email ?? undefined,
      phone: order.customer.phone,
    },
    successUrl: `${storeBaseUrl}/checkout/success?order=${order.orderId}`,
    cancelUrl: `${storeBaseUrl}/cart`,
    webhookUrl: `${origin}/api/webhooks/payments/${provider.name}`,
  });
  await withStore(
    storeId,
    (tx) =>
      tx
        .insert(payments)
        .values({
          storeId,
          orderId: order.orderId,
          provider: provider.name,
          providerRef: res.providerRef,
          status: "pending",
          amountAgorot: order.totalAgorot,
        })
        .onConflictDoNothing(),
    db,
  );
  return res.url;
}
