import { and, eq, lte, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { outboxJobs } from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import { getOrder } from "@/lib/orders/service";
import { getInvoiceProvider } from "@/lib/invoices";
import { getEmailProvider } from "@/lib/email";
import {
  orderConfirmationEmail,
  orderStatusEmail,
} from "@/lib/email/templates";
import { invoices, stores } from "@/lib/db/schema";
import { orderStatusSchema } from "./types";

const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 120;

type Job = typeof outboxJobs.$inferSelect;

async function storeName(storeId: string, db?: Db) {
  const [s] = await withStore(
    storeId,
    (tx) => tx.select({ name: stores.name }).from(stores),
    db,
  );
  return s?.name ?? "";
}

async function handle(job: Job, db?: Db) {
  const orderId = String((job.payload as { orderId?: string }).orderId ?? "");
  const order = await getOrder(job.storeId, orderId, db);
  if (!order) return; // order gone: nothing to do

  if (job.type === "create_invoice") {
    if (order.invoice) return;
    const provider = getInvoiceProvider();
    const doc = await provider.createInvoiceReceipt({
      id: order.id,
      number: order.number,
      totalAgorot: order.totalAgorot,
      vatRateBp: order.vatRateBp,
      customer: order.customer
        ? {
            name: order.customer.name,
            email: order.customer.email,
            phone: order.customer.phoneE164,
          }
        : null,
      items: order.items.map((i) => ({
        title: i.titleSnapshot,
        qty: i.qty,
        unitPriceAgorot: i.unitPriceAgorot,
      })),
    });
    await withStore(
      job.storeId,
      (tx) =>
        tx
          .insert(invoices)
          .values({
            storeId: job.storeId,
            orderId,
            provider: provider.name,
            providerDocId: doc.docId,
            url: doc.url,
          })
          .onConflictDoNothing(),
      db,
    );
    return;
  }

  if (job.type === "send_order_email" || job.type === "send_status_email") {
    const to = order.customer?.email;
    if (!to) return;
    const mail = {
      storeName: await storeName(job.storeId, db),
      number: order.number,
      totalAgorot: order.totalAgorot,
      customerName: order.customer?.name ?? "",
      items: order.items.map((i) => ({
        title: i.titleSnapshot,
        qty: i.qty,
        unitPriceAgorot: i.unitPriceAgorot,
      })),
    };
    const msg =
      job.type === "send_order_email"
        ? orderConfirmationEmail(to, mail, order.invoice?.url)
        : orderStatusEmail(
            to,
            mail,
            orderStatusSchema.parse(
              (job.payload as { status?: string }).status,
            ),
          );
    await getEmailProvider().send(msg);
    return;
  }
  throw new Error(`unknown job type ${job.type}`);
}

/**
 * Claims due jobs with a short lease (so concurrent workers don't double-run), runs them,
 * and retries failures with backoff. Safe to call from cron and right after a payment.
 */
export async function runOutbox({
  limit = 20,
  db = getDb(),
}: { limit?: number; db?: Db } = {}) {
  const claimed = await db.execute<Job & Record<string, unknown>>(sql`
    update outbox_jobs set attempts = attempts + 1, run_at = now() + make_interval(secs => ${LEASE_SECONDS})
    where id in (
      select id from outbox_jobs where status = 'pending' and run_at <= now()
      order by run_at limit ${limit} for update skip locked
    )
    returning id, store_id as "storeId", type, payload, attempts`);

  let done = 0;
  let failed = 0;
  for (const row of claimed.rows as unknown as (Job & { attempts: number })[]) {
    try {
      await handle(row, db);
      await db
        .update(outboxJobs)
        .set({ status: "done", lastError: null })
        .where(eq(outboxJobs.id, row.id));
      done++;
    } catch (e) {
      failed++;
      const exhausted = row.attempts >= MAX_ATTEMPTS;
      await db
        .update(outboxJobs)
        .set({
          status: exhausted ? "failed" : "pending",
          lastError: String(e instanceof Error ? e.message : e).slice(0, 500),
          runAt: sql`now() + make_interval(secs => ${Math.min(2 ** row.attempts * 30, 3600)})`,
        })
        .where(
          and(
            eq(outboxJobs.id, row.id),
            lte(outboxJobs.attempts, MAX_ATTEMPTS),
          ),
        );
    }
  }
  return { claimed: claimed.rows.length, done, failed };
}
