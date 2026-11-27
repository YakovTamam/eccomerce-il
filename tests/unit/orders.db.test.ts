import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { createStoreForUser } from "@/lib/tenancy/stores";
import { createProduct } from "@/lib/catalog/service";
import { parseProductForm } from "@/lib/catalog/schemas";
import {
  addToCart,
  applyCartDiscount,
  CartError,
  getCartView,
  setCartQty,
} from "@/lib/cart/service";
import { createDiscount, discountInputSchema } from "@/lib/discounts/service";
import {
  checkoutInputSchema,
  CheckoutError,
  createOrderFromCart,
  paymentOrderRef,
  startPayment,
} from "@/lib/orders/checkout";
import { processPaymentEvent } from "@/lib/orders/payments";
import {
  getOrder,
  OrderError,
  refundOrder,
  setOrderStatus,
} from "@/lib/orders/service";
import { runOutbox } from "@/lib/outbox/worker";
import { withStore } from "@/lib/db/with-store";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)(
  "cart → order → payment (idempotent, tenant-safe)",
  () => {
    const pool = new Pool({ connectionString: url, max: 10 });
    const db = drizzle(pool, { schema });
    const suffix = Math.random().toString(36).slice(2, 8);
    let A: string, B: string, userId: string;
    const prev = { ...process.env };

    const makeProduct = async (
      storeId: string,
      title: string,
      price = "20",
      stock = 5,
    ) => {
      const r = parseProductForm({
        title,
        status: "active",
        variants: [{ title: "רגיל", price, stockQty: stock }],
      });
      if (!r.ok) throw new Error(r.error);
      const p = await createProduct(storeId, r.data, db);
      const [v] = await withStore(
        storeId,
        (tx) =>
          tx
            .select()
            .from(schema.productVariants)
            .where(eq(schema.productVariants.productId, p.id)),
        db,
      );
      return { productId: p.id, variantId: v.id };
    };
    const checkout = (over: object = {}) =>
      checkoutInputSchema.parse({
        name: "דנה כהן",
        phone: "050-123-4567",
        email: "dana@example.com",
        shippingMethod: "pickup",
        ...over,
      });
    const stock = async (storeId: string, variantId: string) =>
      (
        await withStore(
          storeId,
          (tx) =>
            tx
              .select()
              .from(schema.productVariants)
              .where(eq(schema.productVariants.id, variantId)),
          db,
        )
      )[0].stockQty;
    const orderFor = async (
      storeId: string,
      variantId: string,
      qty: number,
      over: object = {},
      code?: string,
    ) => {
      const cartId = await addToCart(storeId, null, variantId, qty, db);
      if (code) await applyCartDiscount(storeId, cartId, code, db);
      return createOrderFromCart(storeId, cartId, checkout(over), db);
    };
    const pay = (
      storeId: string,
      o: { orderId: string; totalAgorot: number },
      over: Partial<{
        amountAgorot: number;
        status: "paid" | "failed";
        providerRef: string;
      }> = {},
    ) =>
      processPaymentEvent(
        "mock",
        {
          providerRef: over.providerRef ?? `mock_${o.orderId}`,
          orderId: paymentOrderRef(storeId, o.orderId),
          amountAgorot: over.amountAgorot ?? o.totalAgorot,
          status: over.status ?? "paid",
          raw: {},
        },
        db,
      );
    const jobs = async (storeId: string) =>
      (
        await withStore(
          storeId,
          (tx) => tx.select().from(schema.outboxJobs),
          db,
        )
      )
        .map((j) => j.type)
        .sort();

    beforeAll(async () => {
      process.env.AUTH_SECRET = "test-secret";
      process.env.PAYMENT_PROVIDER = "mock";
      process.env.INVOICE_PROVIDER = "mock";
      await migrate(db, { migrationsFolder: "drizzle" });
      userId = (
        await db
          .insert(schema.users)
          .values({ email: `ord-${suffix}@t.test`, name: "o" })
          .returning()
      )[0].id;
      A = (
        await createStoreForUser(
          userId,
          { name: "A", slug: `oa-${suffix}` },
          db,
        )
      ).id;
      B = (
        await createStoreForUser(
          userId,
          { name: "B", slug: `ob-${suffix}` },
          db,
        )
      ).id;
    });
    afterAll(async () => {
      process.env = prev;
      await db.delete(schema.stores).where(sql`id in (${A}, ${B})`);
      await db.delete(schema.users).where(eq(schema.users.id, userId));
      await pool.end();
    });

    it("full flow: coupon, server-side prices, payment decrements stock once, duplicate webhook is a no-op", async () => {
      const { variantId } = await makeProduct(A, "חלה", "20", 5);
      await createDiscount(
        A,
        discountInputSchema.parse({
          code: "save10",
          type: "percent",
          value: 10,
        }),
        db,
      );

      const o = await orderFor(A, variantId, 2, {}, "save10");
      // 2 × 20.00 = 40.00, −10% = 36.00 (pickup, no shipping)
      expect(o.totalAgorot).toBe(3600);
      expect((await getOrder(A, o.orderId, db))?.status).toBe(
        "pending_payment",
      );
      expect(await stock(A, variantId)).toBe(5); // not reserved until paid

      expect((await pay(A, o)).status).toBe("paid");
      const order = (await getOrder(A, o.orderId, db))!;
      expect(order.status).toBe("paid");
      expect(order.paidAt).toBeTruthy();
      expect(await stock(A, variantId)).toBe(3);
      expect(
        (await withStore(A, (tx) => tx.select().from(schema.discounts), db))[0]
          .usedCount,
      ).toBe(1);
      expect(await jobs(A)).toEqual(["create_invoice", "send_order_email"]);

      // replay: same webhook again
      expect((await pay(A, o)).status).toBe("duplicate");
      expect(await stock(A, variantId)).toBe(3);
      expect(
        (await withStore(A, (tx) => tx.select().from(schema.discounts), db))[0]
          .usedCount,
      ).toBe(1);
      expect(await jobs(A)).toEqual(["create_invoice", "send_order_email"]);
      expect((await getOrder(A, o.orderId, db))!.payments).toHaveLength(1);
    });

    it("concurrent duplicate webhooks produce exactly one paid transition", async () => {
      const { variantId } = await makeProduct(A, "לחם", "10", 10);
      const o = await orderFor(A, variantId, 3);
      const results = await Promise.all([
        pay(A, o),
        pay(A, o),
        pay(A, o),
        pay(A, o),
      ]);
      expect(results.filter((r) => r.status === "paid")).toHaveLength(1);
      expect(results.filter((r) => r.status === "duplicate")).toHaveLength(3);
      expect(await stock(A, variantId)).toBe(7);
    });

    it("never marks an order paid for the wrong amount", async () => {
      const { variantId } = await makeProduct(A, "עוגה", "50", 5);
      const o = await orderFor(A, variantId, 1);
      expect((await pay(A, o, { amountAgorot: 100 })).status).toBe(
        "amount_mismatch",
      );
      expect((await getOrder(A, o.orderId, db))?.status).toBe(
        "pending_payment",
      );
      expect(await stock(A, variantId)).toBe(5);
      expect((await pay(A, o)).status).toBe("paid"); // the right amount still works
    });

    it("failed payment leaves the order pending; garbage refs are rejected", async () => {
      const { variantId } = await makeProduct(A, "בורקס", "12", 5);
      const o = await orderFor(A, variantId, 1);
      expect((await pay(A, o, { status: "failed" })).status).toBe(
        "payment_failed",
      );
      expect((await getOrder(A, o.orderId, db))?.status).toBe(
        "pending_payment",
      );
      expect(
        (
          await processPaymentEvent(
            "mock",
            {
              providerRef: "x",
              orderId: "not-a-ref",
              amountAgorot: 1,
              status: "paid",
              raw: {},
            },
            db,
          )
        ).status,
      ).toBe("invalid_ref");
      // an order id from another store cannot be paid through this store's ref
      const other = await processPaymentEvent(
        "mock",
        {
          providerRef: "x",
          orderId: paymentOrderRef(B, o.orderId),
          amountAgorot: o.totalAgorot,
          status: "paid",
          raw: {},
        },
        db,
      );
      expect(other.status).toBe("unknown_order");
    });

    it("clamps stock at 0 and flags the order when oversold between checkout and payment", async () => {
      const { variantId } = await makeProduct(A, "מארז", "30", 2);
      const o = await orderFor(A, variantId, 2);
      await withStore(
        A,
        (tx) =>
          tx
            .update(schema.productVariants)
            .set({ stockQty: 1 })
            .where(eq(schema.productVariants.id, variantId)),
        db,
      );
      const r = await pay(A, o);
      expect(r).toMatchObject({ status: "paid", oversold: true });
      expect(await stock(A, variantId)).toBe(0);
      expect((await getOrder(A, o.orderId, db))!.notes).toContain("חוסר מלאי");
    });

    it("checkout refuses more than the stock; cart only accepts this store's active products", async () => {
      const { variantId } = await makeProduct(A, "נדיר", "99", 1);
      await expect(addToCart(A, null, variantId, 2, db)).rejects.toBeInstanceOf(
        CartError,
      );
      await expect(addToCart(B, null, variantId, 1, db)).rejects.toBeInstanceOf(
        CartError,
      ); // A's variant is invisible to B
      const cartId = await addToCart(A, null, variantId, 1, db);
      await withStore(
        A,
        (tx) =>
          tx
            .update(schema.productVariants)
            .set({ stockQty: 0 })
            .where(eq(schema.productVariants.id, variantId)),
        db,
      );
      expect((await getCartView(A, cartId, db))!.issues.join()).toContain(
        "אזל",
      );
      await expect(
        createOrderFromCart(A, cartId, checkout(), db),
      ).rejects.toBeInstanceOf(CheckoutError);
    });

    it("another store cannot read or modify this store's cart/orders", async () => {
      const { variantId } = await makeProduct(A, "פרטי", "5", 5);
      const cartId = await addToCart(A, null, variantId, 1, db);
      expect(await getCartView(B, cartId, db)).toBeNull();
      await expect(
        setCartQty(B, cartId, variantId, 5, db),
      ).rejects.toBeInstanceOf(CartError);
      const o = await orderFor(A, variantId, 1);
      expect(await getOrder(B, o.orderId, db)).toBeNull();
    });

    it("order numbers run per store; delivery needs an address; free shipping over the threshold", async () => {
      const a = await makeProduct(A, "מספר", "10", 50);
      const b = await makeProduct(B, "מספר B", "10", 50);
      const o1 = await orderFor(A, a.variantId, 1);
      const o2 = await orderFor(A, a.variantId, 1);
      const ob = await orderFor(B, b.variantId, 1);
      expect(o2.number).toBe(o1.number + 1);
      expect(ob.number).toBe(1);

      const cartId = await addToCart(A, null, a.variantId, 1, db);
      expect(() => checkout({ shippingMethod: "delivery" })).toThrow();
      const d = await createOrderFromCart(
        A,
        cartId,
        checkout({
          shippingMethod: "delivery",
          address: { street: "הרצל 1", city: "חיפה" },
        }),
        db,
      );
      expect(d.totalAgorot).toBe(1000 + 3000); // flat rate

      const big = await makeProduct(A, "גדול", "260", 5);
      const c2 = await addToCart(A, null, big.variantId, 1, db);
      const d2 = await createOrderFromCart(
        A,
        c2,
        checkout({
          shippingMethod: "delivery",
          address: { street: "הרצל 1", city: "חיפה" },
        }),
        db,
      );
      expect(d2.totalAgorot).toBe(26000); // ≥ ₪250 → free shipping
    });

    it("coupon rules: unknown/expired/exhausted codes are rejected", async () => {
      const { variantId } = await makeProduct(A, "קופון", "10", 5);
      const cartId = await addToCart(A, null, variantId, 1, db);
      await expect(applyCartDiscount(A, cartId, "nope", db)).rejects.toThrow(
        "לא קיים",
      );
      await createDiscount(
        A,
        discountInputSchema.parse({
          code: "OLD",
          type: "fixed",
          value: 100,
          endsAt: new Date("2020-01-01"),
          startsAt: new Date("2019-01-01"),
        }),
        db,
      );
      await expect(applyCartDiscount(A, cartId, "old", db)).rejects.toThrow(
        "הסתיים",
      );
      await createDiscount(
        A,
        discountInputSchema.parse({
          code: "ONCE",
          type: "fixed",
          value: 100,
          usageLimit: 1,
        }),
        db,
      );
      const o = await orderFor(A, variantId, 1, {}, "once");
      await pay(A, o);
      const c2 = await addToCart(A, null, variantId, 1, db);
      await expect(applyCartDiscount(A, c2, "once", db)).rejects.toThrow(
        "מוצה",
      );
      await expect(
        createDiscount(
          A,
          discountInputSchema.parse({ code: "ONCE", type: "fixed", value: 5 }),
          db,
        ),
      ).rejects.toThrow();
    });

    it("outbox creates exactly one invoice per order, even if run repeatedly", async () => {
      const { variantId } = await makeProduct(A, "חשבונית", "20", 5);
      const o = await orderFor(A, variantId, 1);
      await pay(A, o);
      await runOutbox({ db, limit: 100 });
      await runOutbox({ db, limit: 100 });
      const inv = (await getOrder(A, o.orderId, db))!.invoice;
      expect(inv?.providerDocId).toMatch(/^MOCK-/);
      const rows = await withStore(
        A,
        (tx) =>
          tx
            .select()
            .from(schema.invoices)
            .where(eq(schema.invoices.orderId, o.orderId)),
        db,
      );
      expect(rows).toHaveLength(1);
      const pending = (
        await withStore(A, (tx) => tx.select().from(schema.outboxJobs), db)
      ).filter((j) => j.status === "pending");
      expect(
        pending.filter(
          (j) => (j.payload as { orderId: string }).orderId === o.orderId,
        ),
      ).toHaveLength(0);
    });

    it("status machine and refund (restocks, refuses double refund)", async () => {
      const { variantId } = await makeProduct(A, "החזר", "20", 5);
      const o = await orderFor(A, variantId, 2);
      await expect(
        setOrderStatus(A, o.orderId, "paid", db),
      ).rejects.toBeInstanceOf(OrderError); // never manual
      await expect(refundOrder(A, o.orderId, db)).rejects.toBeInstanceOf(
        OrderError,
      ); // unpaid
      await pay(A, o);
      expect(await stock(A, variantId)).toBe(3);
      await setOrderStatus(A, o.orderId, "preparing", db);
      await refundOrder(A, o.orderId, db);
      expect((await getOrder(A, o.orderId, db))?.status).toBe("refunded");
      expect(await stock(A, variantId)).toBe(5);
      await expect(refundOrder(A, o.orderId, db)).rejects.toBeInstanceOf(
        OrderError,
      );
      await expect(
        setOrderStatus(A, o.orderId, "completed", db),
      ).rejects.toBeInstanceOf(OrderError);
    });

    it("startPayment asks the provider for a hosted page and records a pending payment", async () => {
      const { variantId } = await makeProduct(A, "תשלום", "20", 5);
      const o = await orderFor(A, variantId, 1);
      const payUrl = await startPayment(A, o, "http://a.localhost:3000", db);
      expect(payUrl).toContain("/api/mock-pay?");
      const p = (await getOrder(A, o.orderId, db))!.payments;
      expect(p).toHaveLength(1);
      expect(p[0]).toMatchObject({
        status: "pending",
        provider: "mock",
        amountAgorot: 2000,
      });
    });
  },
);
