import { outboxJobs } from "@/lib/db/schema";
import type { StoreTx } from "@/lib/db/with-store";

export type JobType =
  "create_invoice" | "send_order_email" | "send_status_email";

/** Transactional outbox: call inside the same withStore() transaction as the state change. Idempotent via dedupeKey. */
export async function enqueue(
  tx: StoreTx,
  storeId: string,
  type: JobType,
  payload: Record<string, unknown>,
  dedupeKey: string,
) {
  await tx
    .insert(outboxJobs)
    .values({ storeId, type, payload, dedupeKey })
    .onConflictDoNothing({
      target: [outboxJobs.storeId, outboxJobs.dedupeKey],
    });
}
