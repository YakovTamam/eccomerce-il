import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "@/lib/db/client";
import {
  oauthGrants,
  outboxJobs,
  platformAuditLog,
  storeDomains,
  stores,
  whatsappAccounts,
} from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto/secrets";
import { normalizePhone } from "@/lib/phone";
import { getRootDomains, normalizeHost } from "@/lib/tenancy/resolve-host";

/** Platform-admin mutations. Each one is a single transaction that also writes platform_audit_log. */

export class AdminError extends Error {}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const log = (
  tx: Tx,
  adminId: string,
  action: string,
  storeId: string | null,
  details: Record<string, unknown> = {},
) =>
  tx
    .insert(platformAuditLog)
    .values({ actorUserId: adminId, action, storeId, details });

const uuid = z.string().uuid();
const must = (id: string) => uuid.parse(id);

export async function setStoreStatus(
  adminId: string,
  storeId: string,
  status: "active" | "suspended",
  reason: string,
  db: Db = getDb(),
) {
  const why = reason.trim();
  if (status === "suspended" && why.length < 3)
    throw new AdminError("נדרשת סיבה להשעיה (לפחות 3 תווים)");
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ status: stores.status })
      .from(stores)
      .where(eq(stores.id, must(storeId)))
      .for("update");
    if (!before) throw new AdminError("החנות לא נמצאה");
    if (before.status === status) return;
    await tx.update(stores).set({ status }).where(eq(stores.id, storeId));
    await log(
      tx,
      adminId,
      status === "suspended" ? "store.suspend" : "store.activate",
      storeId,
      { from: before.status, to: status, reason: why || null },
    );
    if (status === "suspended") {
      // MCP connections stop working immediately (authentication also checks store status on every request).
      await tx
        .update(oauthGrants)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(oauthGrants.storeId, storeId),
            sql`${oauthGrants.revokedAt} is null`,
          ),
        );
    }
  });
}

export async function setStorePlan(
  adminId: string,
  storeId: string,
  plan: "basic" | "pro" | "growth",
  db: Db = getDb(),
) {
  const p = z.enum(["basic", "pro", "growth"]).parse(plan);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ plan: stores.plan })
      .from(stores)
      .where(eq(stores.id, must(storeId)))
      .for("update");
    if (!before) throw new AdminError("החנות לא נמצאה");
    if (before.plan === p) return;
    await tx.update(stores).set({ plan: p }).where(eq(stores.id, storeId));
    await log(tx, adminId, "store.plan_change", storeId, {
      from: before.plan,
      to: p,
    });
  });
}

// ── domains ───────────────────────────────────────────────────────────────────
export function validateCustomHostname(
  input: string,
  roots: string[] = getRootDomains(),
): string {
  const h = normalizeHost(input.replace(/^https?:\/\//i, "").split("/")[0]);
  const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  const tld = "(?:xn--[a-z0-9-]{2,59}|[a-z]{2,24})";
  if (!h || h.length > 253 || !new RegExp(`^(?:${label}\\.)+${tld}$`).test(h))
    throw new AdminError("שם דומיין לא תקין");
  for (const r of roots.map(normalizeHost).filter(Boolean)) {
    if (h === r || h.endsWith(`.${r}`))
      throw new AdminError("אי אפשר להגדיר דומיין של הפלטפורמה כדומיין פרטי");
  }
  if (h.endsWith(".vercel.app") || h.endsWith(".localhost"))
    throw new AdminError("דומיין לא מותר");
  return h;
}

export async function addDomain(
  adminId: string,
  storeId: string,
  hostname: string,
  db: Db = getDb(),
) {
  const h = validateCustomHostname(hostname);
  return db.transaction(async (tx) => {
    const [taken] = await tx
      .select({ id: storeDomains.id })
      .from(storeDomains)
      .where(eq(storeDomains.hostname, h));
    if (taken) throw new AdminError("הדומיין כבר רשום במערכת");
    const [exists] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.id, must(storeId)));
    if (!exists) throw new AdminError("החנות לא נמצאה");
    await tx.insert(storeDomains).values({ storeId, hostname: h });
    await log(tx, adminId, "domain.add", storeId, { hostname: h });
  });
}

export async function setDomainVerified(
  adminId: string,
  domainId: string,
  verified: boolean,
  db: Db = getDb(),
) {
  return db.transaction(async (tx) => {
    const [d] = await tx
      .select()
      .from(storeDomains)
      .where(eq(storeDomains.id, must(domainId)))
      .for("update");
    if (!d) throw new AdminError("הדומיין לא נמצא");
    await tx
      .update(storeDomains)
      .set({
        verifiedAt: verified ? new Date() : null,
        ...(verified ? {} : { isPrimary: false }),
      })
      .where(eq(storeDomains.id, domainId));
    await log(
      tx,
      adminId,
      verified ? "domain.verify" : "domain.unverify",
      d.storeId,
      { hostname: d.hostname },
    );
    return d.storeId;
  });
}

export async function setPrimaryDomain(
  adminId: string,
  domainId: string,
  db: Db = getDb(),
) {
  return db.transaction(async (tx) => {
    const [d] = await tx
      .select()
      .from(storeDomains)
      .where(eq(storeDomains.id, must(domainId)))
      .for("update");
    if (!d) throw new AdminError("הדומיין לא נמצא");
    if (!d.verifiedAt)
      throw new AdminError("יש לאמת את הדומיין לפני שמגדירים אותו כראשי");
    await tx
      .update(storeDomains)
      .set({ isPrimary: false })
      .where(eq(storeDomains.storeId, d.storeId));
    await tx
      .update(storeDomains)
      .set({ isPrimary: true })
      .where(eq(storeDomains.id, domainId));
    await log(tx, adminId, "domain.set_primary", d.storeId, {
      hostname: d.hostname,
    });
    return d.storeId;
  });
}

export async function removeDomain(
  adminId: string,
  domainId: string,
  db: Db = getDb(),
) {
  return db.transaction(async (tx) => {
    const [d] = await tx
      .delete(storeDomains)
      .where(eq(storeDomains.id, must(domainId)))
      .returning();
    if (!d) throw new AdminError("הדומיין לא נמצא");
    await log(tx, adminId, "domain.remove", d.storeId, {
      hostname: d.hostname,
    });
    return d.storeId;
  });
}

// ── WhatsApp account (manual setup in the MVP) ────────────────────────────────
export const whatsappInputSchema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{5,25}$/, "Phone Number ID: ספרות בלבד"),
  wabaId: z
    .string()
    .trim()
    .regex(/^\d{5,25}$/, "WABA ID: ספרות בלבד"),
  displayPhone: z.string().trim().min(5, "נא להזין מספר תצוגה"),
  accessToken: z.string().trim().max(1000).optional(),
  status: z.enum(["pending", "active", "disabled"]),
});

export async function saveWhatsappAccount(
  adminId: string,
  storeId: string,
  raw: unknown,
  db: Db = getDb(),
) {
  const i = whatsappInputSchema.parse(raw);
  const phone = normalizePhone(i.displayPhone);
  if (!phone) throw new AdminError("מספר הטלפון לא תקין");
  return db.transaction(async (tx) => {
    const [store] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.id, must(storeId)));
    if (!store) throw new AdminError("החנות לא נמצאה");
    const [cur] = await tx
      .select()
      .from(whatsappAccounts)
      .where(eq(whatsappAccounts.storeId, storeId))
      .for("update");
    if (!cur && !i.accessToken)
      throw new AdminError("נדרש טוקן גישה בחיבור ראשון");
    const [clash] = await tx
      .select({ storeId: whatsappAccounts.storeId })
      .from(whatsappAccounts)
      .where(eq(whatsappAccounts.phoneNumberId, i.phoneNumberId));
    if (clash && clash.storeId !== storeId)
      throw new AdminError("מספר הוואטסאפ הזה כבר מחובר לחנות אחרת");
    const values = {
      phoneNumberId: i.phoneNumberId,
      wabaId: i.wabaId,
      displayPhone: phone,
      status: i.status,
      updatedAt: new Date(),
      ...(i.accessToken
        ? { accessTokenEncrypted: encryptSecret(i.accessToken) }
        : {}),
    };
    if (cur)
      await tx
        .update(whatsappAccounts)
        .set(values)
        .where(eq(whatsappAccounts.id, cur.id));
    else
      await tx.insert(whatsappAccounts).values({
        storeId,
        ...values,
        accessTokenEncrypted: encryptSecret(i.accessToken as string),
      });
    // never log the token itself
    await log(
      tx,
      adminId,
      cur ? "whatsapp.update" : "whatsapp.connect",
      storeId,
      {
        phoneNumberId: i.phoneNumberId,
        status: i.status,
        tokenChanged: !!i.accessToken,
      },
    );
  });
}

// ── operations ────────────────────────────────────────────────────────────────
export async function retryJob(
  adminId: string,
  jobId: string,
  db: Db = getDb(),
) {
  return db.transaction(async (tx) => {
    const [j] = await tx
      .update(outboxJobs)
      .set({
        status: "pending",
        attempts: 0,
        runAt: new Date(),
        lastError: null,
      })
      .where(
        and(eq(outboxJobs.id, must(jobId)), eq(outboxJobs.status, "failed")),
      )
      .returning();
    if (!j) throw new AdminError("המשימה לא נמצאה או שאינה במצב כשל");
    await log(tx, adminId, "job.retry", j.storeId, { type: j.type });
  });
}

export async function revokeAllConnections(
  adminId: string,
  storeId: string,
  db: Db = getDb(),
) {
  return db.transaction(async (tx) => {
    const r = await tx
      .update(oauthGrants)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthGrants.storeId, must(storeId)),
          sql`${oauthGrants.revokedAt} is null`,
        ),
      )
      .returning({ id: oauthGrants.id });
    await log(tx, adminId, "mcp.revoke_all", storeId, { count: r.length });
    return r.length;
  });
}
