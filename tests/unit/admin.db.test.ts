import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { createStoreForUser } from "@/lib/tenancy/stores";
import {
  addDomain,
  AdminError,
  removeDomain,
  retryJob,
  revokeAllConnections,
  saveWhatsappAccount,
  setDomainVerified,
  setPrimaryDomain,
  setStorePlan,
  setStoreStatus,
  validateCustomHostname,
} from "@/lib/admin/service";
import {
  adminOverview,
  getStoreAdmin,
  listAdminAudit,
  listDomainsAdmin,
  listStoresAdmin,
  systemHealth,
} from "@/lib/admin/queries";
import {
  authenticateAccessToken,
  createAuthorizationCode,
  exchangeCode,
  registerClient,
} from "@/lib/oauth/service";
import { decryptSecret } from "@/lib/crypto/secrets";

const url = process.env.TEST_DATABASE_URL;
const ROOTS = ["xn--4dbklvp7aj.xn--4dbrk0ce", "ecomm-il.co.il", "localhost"];

describe("validateCustomHostname", () => {
  it("accepts real domains (IDN → punycode) and refuses platform/internal ones", () => {
    expect(validateCustomHostname("https://Shop.Example.com/path", ROOTS)).toBe(
      "shop.example.com",
    );
    expect(validateCustomHostname("חנות.co.il", ROOTS)).toMatch(/^xn--/);
    for (const bad of [
      "",
      "nodots",
      "xn--4dbklvp7aj.xn--4dbrk0ce",
      "pizza.ecomm-il.co.il",
      "foo.localhost",
      "x.vercel.app",
      "a b.com",
      "-.com",
      "a-.com",
      "1.2.3.4",
      "x.123",
      "-.com",
    ])
      expect(() => validateCustomHostname(bad, ROOTS)).toThrow(AdminError);
  });
});

describe.skipIf(!url)("super-admin service & queries", () => {
  const pool = new Pool({ connectionString: url, max: 6 });
  const db = drizzle(pool, { schema });
  const suffix = Math.random().toString(36).slice(2, 8);
  let admin: string, o1: string, o2: string, A: string, B: string;

  const audit = async (storeId: string) =>
    (
      await db
        .select()
        .from(schema.platformAuditLog)
        .where(eq(schema.platformAuditLog.storeId, storeId))
    ).map((r) => r.action);
  const paidOrder = (storeId: string, n: number, total: number, daysAgo = 1) =>
    db.insert(schema.orders).values({
      storeId,
      number: n,
      status: "paid",
      subtotalAgorot: total,
      totalAgorot: total,
      vatRateBp: 1800,
      shippingMethod: "pickup",
      paidAt: new Date(Date.now() - daysAgo * 86_400_000),
    });

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
    process.env.APP_URL = "http://app.localhost:3000";
    process.env.ALT_ROOT_DOMAIN = "ecomm-il.co.il";
    await migrate(db, { migrationsFolder: "drizzle" });
    const mk = async (n: string) =>
      (
        await db
          .insert(schema.users)
          .values({ email: `${n}-${suffix}@t.test`, name: `מנהל ${n}` })
          .returning()
      )[0].id;
    [admin, o1, o2] = [await mk("adm"), await mk("own1"), await mk("own2")];
    A = (
      await createStoreForUser(
        o1,
        { name: "מאפיית אלפא", slug: `adma-${suffix}` },
        db,
      )
    ).id;
    B = (
      await createStoreForUser(
        o2,
        { name: "בוטיק בטא", slug: `admb-${suffix}` },
        db,
      )
    ).id;
  });
  afterAll(async () => {
    await db.delete(schema.stores).where(sql`id in (${A}, ${B})`);
    await db.delete(schema.users).where(sql`id in (${admin}, ${o1}, ${o2})`);
    await pool.end();
  });

  it("suspension needs a reason, is audited, is idempotent, kills MCP tokens and reverses cleanly", async () => {
    const client = await registerClient(
      { client_name: "c", redirect_uris: ["https://claude.ai/cb"] },
      db,
    );
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    const code = await createAuthorizationCode(
      {
        clientId: client.clientId,
        userId: o1,
        storeId: A,
        scopes: ["read"],
        codeChallenge: challenge,
        redirectUri: "https://claude.ai/cb",
      },
      db,
    );
    const tok = await exchangeCode(
      {
        code,
        clientId: client.clientId,
        redirectUri: "https://claude.ai/cb",
        codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      },
      db,
    );
    expect(await authenticateAccessToken(tok.access_token, db)).not.toBeNull();

    await expect(
      setStoreStatus(admin, A, "suspended", " x ", db),
    ).rejects.toBeInstanceOf(AdminError);
    await setStoreStatus(admin, A, "suspended", "חשד להונאה", db);
    await setStoreStatus(admin, A, "suspended", "again", db); // no-op
    expect((await audit(A)).filter((a) => a === "store.suspend")).toHaveLength(
      1,
    );
    expect(
      (await db.select().from(schema.stores).where(eq(schema.stores.id, A)))[0]
        .status,
    ).toBe("suspended");
    expect(await authenticateAccessToken(tok.access_token, db)).toBeNull();

    await setStoreStatus(admin, A, "active", "", db);
    expect(await audit(A)).toEqual(
      expect.arrayContaining(["store.suspend", "store.activate"]),
    );
    const log = (await listAdminAudit({}, db)).find(
      (l) => l.action === "store.suspend" && l.slug === `adma-${suffix}`,
    );
    expect(log?.details).toMatchObject({
      from: "active",
      to: "suspended",
      reason: "חשד להונאה",
    });
    await expect(
      setStoreStatus(
        admin,
        "00000000-0000-4000-8000-000000000000",
        "active",
        "",
        db,
      ),
    ).rejects.toBeInstanceOf(AdminError);
  });

  it("changes plans (audited, no-op when unchanged) and rejects junk", async () => {
    await setStorePlan(admin, B, "pro", db);
    await setStorePlan(admin, B, "pro", db);
    expect(
      (await audit(B)).filter((a) => a === "store.plan_change"),
    ).toHaveLength(1);
    await expect(
      setStorePlan(admin, B, "enterprise" as never, db),
    ).rejects.toThrow();
  });

  it("domains: add, dedupe, verify, one primary (verified only), remove — all audited", async () => {
    await addDomain(admin, A, "shop.alpha-bakery.co.il", db);
    await expect(
      addDomain(admin, B, "SHOP.alpha-bakery.co.il", db),
    ).rejects.toThrow("כבר רשום");
    await expect(
      addDomain(admin, A, "evil.ecomm-il.co.il", db),
    ).rejects.toBeInstanceOf(AdminError);
    const [d] = (await listDomainsAdmin(db)).filter(
      (x) => x.slug === `adma-${suffix}`,
    );
    expect(d).toMatchObject({ verifiedAt: null, isPrimary: false });
    await expect(setPrimaryDomain(admin, d.id, db)).rejects.toThrow("לאמת");
    await setDomainVerified(admin, d.id, true, db);
    await addDomain(admin, A, "www.alpha-bakery.co.il", db);
    const d2 = (await listDomainsAdmin(db)).find(
      (x) => x.hostname === "www.alpha-bakery.co.il",
    )!;
    await setDomainVerified(admin, d2.id, true, db);
    await setPrimaryDomain(admin, d.id, db);
    await setPrimaryDomain(admin, d2.id, db);
    const mine = (await getStoreAdmin(A, db))!.domains;
    expect(mine.filter((x) => x.isPrimary).map((x) => x.hostname)).toEqual([
      "www.alpha-bakery.co.il",
    ]);
    await setDomainVerified(admin, d2.id, false, db); // un-verifying also drops primary
    expect((await getStoreAdmin(A, db))!.domains.some((x) => x.isPrimary)).toBe(
      false,
    );
    await removeDomain(admin, d.id, db);
    expect(await audit(A)).toEqual(
      expect.arrayContaining([
        "domain.add",
        "domain.verify",
        "domain.set_primary",
        "domain.unverify",
        "domain.remove",
      ]),
    );
  });

  it("WhatsApp: token encrypted at rest, never returned or logged, kept on update, unique per number", async () => {
    await expect(
      saveWhatsappAccount(
        admin,
        A,
        {
          phoneNumberId: "123456789012",
          wabaId: "998877665544",
          displayPhone: "050-123-4567",
          status: "pending",
        },
        db,
      ),
    ).rejects.toThrow("טוקן");
    await saveWhatsappAccount(
      admin,
      A,
      {
        phoneNumberId: "123456789012",
        wabaId: "998877665544",
        displayPhone: "050-123-4567",
        accessToken: "EAAG-super-secret-token",
        status: "pending",
      },
      db,
    );
    const [row] = await db
      .select()
      .from(schema.whatsappAccounts)
      .where(eq(schema.whatsappAccounts.storeId, A));
    expect(row.accessTokenEncrypted).not.toContain("EAAG");
    expect(decryptSecret(row.accessTokenEncrypted)).toBe(
      "EAAG-super-secret-token",
    );
    expect(row.displayPhone).toBe("+972501234567");

    await saveWhatsappAccount(
      admin,
      A,
      {
        phoneNumberId: "123456789012",
        wabaId: "998877665544",
        displayPhone: "+972501234567",
        status: "active",
      },
      db,
    ); // no token → keep
    expect(
      decryptSecret(
        (
          await db
            .select()
            .from(schema.whatsappAccounts)
            .where(eq(schema.whatsappAccounts.storeId, A))
        )[0].accessTokenEncrypted,
      ),
    ).toBe("EAAG-super-secret-token");

    const view = await getStoreAdmin(A, db);
    expect(JSON.stringify(view)).not.toMatch(
      /EAAG|access_token|accessToken|encrypted/i,
    );
    expect(view!.whatsapp).toMatchObject({
      status: "active",
      displayPhone: "+972501234567",
    });
    const logs = JSON.stringify(
      (
        await db
          .select()
          .from(schema.platformAuditLog)
          .where(eq(schema.platformAuditLog.storeId, A))
      ).map((l) => l.details),
    );
    expect(logs).not.toContain("EAAG");
    await expect(
      saveWhatsappAccount(
        admin,
        B,
        {
          phoneNumberId: "123456789012",
          wabaId: "1111111111",
          displayPhone: "0521234567",
          accessToken: "x",
          status: "pending",
        },
        db,
      ),
    ).rejects.toThrow("כבר מחובר");
    await expect(
      saveWhatsappAccount(
        admin,
        B,
        {
          phoneNumberId: "abc",
          wabaId: "1",
          displayPhone: "1",
          status: "pending",
        },
        db,
      ),
    ).rejects.toThrow();
  });

  it("store list: search, filters, sorting by revenue, pagination, 30-day aggregates; no customer data leaks", async () => {
    await paidOrder(A, 1, 10000, 2);
    await paidOrder(A, 2, 5000, 3);
    await paidOrder(B, 1, 99900, 1);
    await paidOrder(A, 3, 777700, 45); // outside the 30-day window
    await db.insert(schema.customers).values({
      storeId: A,
      name: "לקוחה סודית",
      phoneE164: "+972509998877",
      email: "secret-customer@example.com",
    });

    const byGmv = await listStoresAdmin({ sort: "gmv", q: suffix }, db);
    expect(byGmv.rows.map((r) => r.id)).toEqual([B, A]);
    expect(byGmv.rows[1]).toMatchObject({
      orders30: 2,
      gmv30Agorot: 15000,
      ordersTotal: 3,
      ownerEmail: `own1-${suffix}@t.test`,
    });
    expect(
      (await listStoresAdmin({ q: `own2-${suffix}` }, db)).rows.map(
        (r) => r.id,
      ),
    ).toEqual([B]); // search by owner email
    expect(
      (await listStoresAdmin({ q: suffix, plan: "pro" }, db)).rows.map(
        (r) => r.id,
      ),
    ).toEqual([B]);
    expect(
      (await listStoresAdmin({ q: suffix, status: "suspended" }, db)).total,
    ).toBe(0);
    const p1 = await listStoresAdmin({ q: suffix, pageSize: 1, page: 1 }, db);
    expect([p1.rows.length, p1.pages, p1.total]).toEqual([1, 2, 2]);
    expect((await listStoresAdmin({ q: "%" }, db)).total).toBe(0); // wildcards are escaped

    const everything = JSON.stringify([
      byGmv,
      await getStoreAdmin(A, db),
      await adminOverview(db),
      await systemHealth(db),
    ]);
    expect(everything).not.toMatch(/secret-customer|לקוחה סודית|9998877/);
  });

  it("overview & store detail: 30-day series, counts and health reflect reality", async () => {
    await db.insert(schema.outboxJobs).values({
      storeId: A,
      type: "create_invoice",
      status: "failed",
      attempts: 5,
      lastError: "boom",
      dedupeKey: `f-${suffix}`,
    });
    const [o] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.storeId, A))
      .limit(1);
    await db.insert(schema.payments).values({
      storeId: A,
      orderId: o.id,
      provider: "mock",
      providerRef: `r-${suffix}`,
      status: "failed",
      amountAgorot: 1,
      raw: { mismatch: { expected: 1, got: 2 } },
    });
    const ov = await adminOverview(db);
    expect(ov.series).toHaveLength(30);
    expect(ov.gmv30Agorot).toBeGreaterThanOrEqual(114900);
    expect(ov.health.failedJobs).toBeGreaterThanOrEqual(1);
    expect(ov.health.failedPayments).toBeGreaterThanOrEqual(1);
    const d = (await getStoreAdmin(A, db))!;
    expect(d.series).toHaveLength(30);
    expect(d.stats).toMatchObject({
      orders: 3,
      orders30: 2,
      gmv30Agorot: 15000,
      gmvTotalAgorot: 792700,
    });
    expect(d.members.map((m) => m.role)).toContain("owner");
    expect(
      await getStoreAdmin("00000000-0000-4000-8000-000000000000", db),
    ).toBeNull();

    const h = await systemHealth(db);
    const job = h.failedJobs.find((j) => j.lastError === "boom")!;
    expect(job).toBeTruthy();
    expect(h.failedPayments.some((p) => p.amountMismatch)).toBe(true);
    await retryJob(admin, job.id, db);
    expect(
      (
        await db
          .select()
          .from(schema.outboxJobs)
          .where(eq(schema.outboxJobs.id, job.id))
      )[0],
    ).toMatchObject({ status: "pending", attempts: 0 });
    await expect(retryJob(admin, job.id, db)).rejects.toBeInstanceOf(
      AdminError,
    ); // only failed jobs
  });

  it("revoke-all MCP connections is audited", async () => {
    const n = await revokeAllConnections(admin, A, db);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(await audit(A)).toContain("mcp.revoke_all");
  });
});
