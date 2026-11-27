import { auditLog } from "@/lib/db/schema";
import { withStore, type StoreTx } from "@/lib/db/with-store";
import type { Db } from "@/lib/db/client";

export type Actor = {
  type: "user" | "mcp" | "ai_agent" | "system";
  id?: string;
};
export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/** Writes inside the caller's transaction so the change and its audit trail commit (or roll back) together. */
export async function audit(
  tx: StoreTx,
  storeId: string,
  actor: Actor,
  e: AuditEntry,
) {
  await tx.insert(auditLog).values({
    storeId,
    actorType: actor.type,
    actorId: actor.id ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    before: (e.before ?? null) as object | null,
    after: (e.after ?? null) as object | null,
  });
}

export const recordAudit = (
  storeId: string,
  actor: Actor,
  e: AuditEntry,
  db?: Db,
) => withStore(storeId, (tx) => audit(tx, storeId, actor, e), db);
