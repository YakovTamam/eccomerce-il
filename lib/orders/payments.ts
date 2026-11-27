import { and, eq, sql } from "drizzle-orm";
import {
  carts,
  discounts,
  orderItems,
  orders,
  payments,
  productVariants,
} from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import type { Db } from "@/lib/db/client";
import { enqueue } from "@/lib/outbox/enqueue";
import type { PaymentEvent } from "@/lib/payments/provider";
import { parsePaymentOrderRef } from "./checkout";

export type PaymentResult =
  | { status: "paid"; storeId: string; orderId: string; oversold: boolean }
  | {
      status:
        | "duplicate"
        | "unknown_order"
        | "amount_mismatch"
        | "payment_failed"
        | "invalid_ref";
    };

/**
 * Applies a VERIFIED payment event. Idempotent: the order row is locked and only a
 * `pending_payment` → `paid` transition has side effects (stock, coupon usage, invoice, email).
 * A replayed webhook therefore changes nothing.
 */
export async function processPaymentEvent(
  providerName: string,
  event: PaymentEvent,
  db?: Db,
): Promise<PaymentResult> {
  const ref = parsePaymentOrderRef(event.orderId);
  if (!ref) return { status: "invalid_ref" };
  const { storeId, orderId } = ref;

  return withStore(
    storeId,
    async (tx): Promise<PaymentResult> => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");
      if (!order) return { status: "unknown_order" };

      if (event.status === "failed") {
        await tx
          .update(payments)
          .set({ status: "failed", raw: event.raw as object })
          .where(
            and(
              eq(payments.provider, providerName),
              eq(payments.providerRef, event.providerRef),
              eq(payments.status, "pending"),
            ),
          );
        return { status: "payment_failed" };
      }

      if (order.status !== "pending_payment") return { status: "duplicate" };

      if (event.amountAgorot !== order.totalAgorot) {
        // Never mark an order paid for a different amount than the server computed.
        await tx
          .update(payments)
          .set({
            status: "failed",
            raw: {
              mismatch: {
                expected: order.totalAgorot,
                got: event.amountAgorot,
              },
              event: event.raw,
            },
          })
          .where(
            and(
              eq(payments.provider, providerName),
              eq(payments.providerRef, event.providerRef),
            ),
          );
        return { status: "amount_mismatch" };
      }

      const [paid] = await tx
        .update(orders)
        .set({ status: "paid", paidAt: new Date() })
        .where(
          and(eq(orders.id, orderId), eq(orders.status, "pending_payment")),
        )
        .returning({ id: orders.id });
      if (!paid) return { status: "duplicate" };

      await tx
        .insert(payments)
        .values({
          storeId,
          orderId,
          provider: providerName,
          providerRef: event.providerRef,
          status: "paid",
          amountAgorot: event.amountAgorot,
          raw: event.raw as object,
        })
        .onConflictDoUpdate({
          target: [payments.provider, payments.providerRef],
          set: { status: "paid", raw: event.raw as object },
        });

      // Stock: decrement tracked variants; clamp at 0 and flag if we oversold (money is already taken).
      let oversold = false;
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      for (const it of items) {
        if (!it.variantId) continue;
        const [v] = await tx
          .select({
            stockQty: productVariants.stockQty,
            trackStock: productVariants.trackStock,
          })
          .from(productVariants)
          .where(eq(productVariants.id, it.variantId))
          .for("update");
        if (!v?.trackStock) continue;
        if (v.stockQty < it.qty) oversold = true;
        await tx
          .update(productVariants)
          .set({
            stockQty: sql`greatest(${productVariants.stockQty} - ${it.qty}, 0)`,
          })
          .where(eq(productVariants.id, it.variantId));
      }
      if (oversold) {
        await tx
          .update(orders)
          .set({
            notes: sql`${orders.notes} || E'\n[מערכת] חוסר מלאי בעת התשלום — נדרש טיפול ידני'`,
          })
          .where(eq(orders.id, orderId));
      }

      if (order.discountCode) {
        await tx
          .update(discounts)
          .set({ usedCount: sql`${discounts.usedCount} + 1` })
          .where(eq(discounts.code, order.discountCode));
      }
      if (order.cartId)
        await tx
          .update(carts)
          .set({ status: "converted" })
          .where(eq(carts.id, order.cartId));

      await enqueue(
        tx,
        storeId,
        "create_invoice",
        { orderId },
        `invoice:${orderId}`,
      );
      await enqueue(
        tx,
        storeId,
        "send_order_email",
        { orderId },
        `email-paid:${orderId}`,
      );
      return { status: "paid", storeId, orderId, oversold };
    },
    db,
  );
}
