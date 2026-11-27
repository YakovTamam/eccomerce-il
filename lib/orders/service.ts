import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  customers,
  invoices,
  orderItems,
  orders,
  payments,
  productVariants,
} from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import type { Db } from "@/lib/db/client";
import { enqueue } from "@/lib/outbox/enqueue";
import { getPaymentProvider } from "@/lib/payments";
import { manualTargets, type OrderStatus } from "./status";

export class OrderError extends Error {}

export function listOrders(
  storeId: string,
  filter: { status?: OrderStatus } = {},
  db?: Db,
) {
  return withStore(
    storeId,
    (tx) =>
      tx
        .select({
          id: orders.id,
          number: orders.number,
          status: orders.status,
          totalAgorot: orders.totalAgorot,
          channel: orders.channel,
          createdAt: orders.createdAt,
          customerName: customers.name,
        })
        .from(orders)
        .leftJoin(customers, eq(customers.id, orders.customerId))
        .where(filter.status ? eq(orders.status, filter.status) : undefined)
        .orderBy(desc(orders.number))
        .limit(200),
    db,
  );
}

export function getOrder(storeId: string, orderId: string, db?: Db) {
  return withStore(
    storeId,
    async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, orderId));
      if (!o) return null;
      const [customer] = o.customerId
        ? await tx
            .select()
            .from(customers)
            .where(eq(customers.id, o.customerId))
        : [];
      return {
        ...o,
        customer: customer ?? null,
        items: await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId)),
        payments: await tx
          .select()
          .from(payments)
          .where(eq(payments.orderId, orderId)),
        invoice:
          (
            await tx
              .select()
              .from(invoices)
              .where(eq(invoices.orderId, orderId))
          )[0] ?? null,
      };
    },
    db,
  );
}

/** Dashboard status change (never to `paid`/`refunded`, see status.ts). */
export function setOrderStatus(
  storeId: string,
  orderId: string,
  to: OrderStatus,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const [o] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");
      if (!o) throw new OrderError("ההזמנה לא נמצאה");
      if (!manualTargets(o.status).includes(to))
        throw new OrderError("מעבר סטטוס לא מותר");
      await tx.update(orders).set({ status: to }).where(eq(orders.id, orderId));
      if (to === "ready" || to === "shipped" || to === "completed") {
        await enqueue(
          tx,
          storeId,
          "send_status_email",
          { orderId, status: to },
          `status:${orderId}:${to}`,
        );
      }
    },
    db,
  );
}

const REFUNDABLE: OrderStatus[] = [
  "paid",
  "preparing",
  "ready",
  "shipped",
  "completed",
];

/** Full refund through the payment provider, then restock and mark refunded. */
export async function refundOrder(storeId: string, orderId: string, db?: Db) {
  const o = await getOrder(storeId, orderId, db);
  if (!o) throw new OrderError("ההזמנה לא נמצאה");
  if (!REFUNDABLE.includes(o.status))
    throw new OrderError("ניתן להחזיר רק הזמנה ששולמה");
  const pay = o.payments.find((p) => p.status === "paid");
  if (!pay) throw new OrderError("לא נמצא תשלום להחזר");

  const provider = getPaymentProvider();
  if (provider.name !== pay.provider)
    throw new OrderError("ספק התשלום של ההזמנה שונה מהספק הפעיל");
  await provider.refund(pay.providerRef, o.totalAgorot); // external call first; DB follows

  await withStore(
    storeId,
    async (tx) => {
      const [locked] = await tx
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");
      if (!locked || !REFUNDABLE.includes(locked.status)) return; // refunded concurrently
      await tx
        .update(orders)
        .set({ status: "refunded" })
        .where(eq(orders.id, orderId));
      await tx
        .update(payments)
        .set({ status: "refunded" })
        .where(and(eq(payments.orderId, orderId), eq(payments.status, "paid")));
      const items = o.items.filter((i) => i.variantId);
      if (items.length) {
        const ids = items.map((i) => i.variantId as string);
        const tracked = new Set(
          (
            await tx
              .select({ id: productVariants.id })
              .from(productVariants)
              .where(
                and(
                  inArray(productVariants.id, ids),
                  eq(productVariants.trackStock, true),
                ),
              )
          ).map((r) => r.id),
        );
        for (const it of items) {
          if (!tracked.has(it.variantId as string)) continue;
          await tx
            .update(productVariants)
            .set({ stockQty: sql`${productVariants.stockQty} + ${it.qty}` })
            .where(eq(productVariants.id, it.variantId as string));
        }
      }
    },
    db,
  );
}
