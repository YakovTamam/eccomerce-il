import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import { createStoreForUser } from "@/lib/tenancy/stores";
import { createProduct, getProduct } from "@/lib/catalog/service";
import { parseProductForm } from "@/lib/catalog/schemas";
import { pageInputSchema } from "@/lib/blocks/schemas";
import { createPage, getPublishedPage, savePage } from "@/lib/pages/service";
import { listDiscounts } from "@/lib/discounts/service";
import {
  approveDraft,
  createCampaignDrafts,
  createDiscountDraft,
  createPageDraft,
  createProductUpdateDraft,
  DraftError,
  getDraft,
  listDrafts,
  rejectDraft,
} from "@/lib/drafts/service";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("drafts, approval and audit", () => {
  const pool = new Pool({ connectionString: url, max: 8 });
  const db = drizzle(pool, { schema });
  const suffix = Math.random().toString(36).slice(2, 8);
  let A: string, B: string, userId: string;
  const actor = { createdBy: "mcp" as const, ref: "grant-1" };
  const pageInput = (heading: string, extra: object[] = []) =>
    pageInputSchema.parse({
      title: "בית",
      blocks: [{ id: "h", type: "hero", heading }, ...extra],
    });
  const audits = async (storeId: string) =>
    (
      await withStore(storeId, (tx) => tx.select().from(schema.auditLog), db)
    ).map((a) => a.action);
  const product = async (
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
    return createProduct(storeId, r.data, db);
  };

  beforeAll(async () => {
    process.env.APP_URL = "http://app.localhost:3000";
    process.env.AUTH_SECRET = "test-secret";
    await migrate(db, { migrationsFolder: "drizzle" });
    userId = (
      await db
        .insert(schema.users)
        .values({ email: `dr-${suffix}@t.test`, name: "d" })
        .returning()
    )[0].id;
    A = (
      await createStoreForUser(userId, { name: "A", slug: `da-${suffix}` }, db)
    ).id;
    B = (
      await createStoreForUser(userId, { name: "B", slug: `db-${suffix}` }, db)
    ).id;
  });
  afterAll(async () => {
    await db.delete(schema.stores).where(sql`id in (${A}, ${B})`);
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  it("create_page → draft changes nothing live → approve publishes it (atomically, with audit)", async () => {
    const d = await createPageDraft(
      A,
      actor,
      { action: "create", slug: "sale", input: pageInput("מבצע") },
      db,
    );
    expect(d.status).toBe("pending");
    expect(d.summary.join(" ")).toContain("/pages/sale");
    expect(await getPublishedPage(A, "sale", db)).toBeNull();

    await approveDraft(A, d.id, "user:u1", db);
    expect((await getPublishedPage(A, "sale", db))?.blocks[0]).toMatchObject({
      heading: "מבצע",
    });
    expect((await getDraft(A, d.id, db))?.status).toBe("approved");
    expect(await audits(A)).toEqual(
      expect.arrayContaining([
        "draft.create",
        "page.create_published",
        "draft.approve",
      ]),
    );
    await expect(approveDraft(A, d.id, "user:u1", db)).rejects.toMatchObject({
      code: "not_pending",
    });
  });

  it("rejects hallucinated product/category ids in blocks", async () => {
    const ghost = "00000000-0000-4000-8000-0000000000aa";
    await expect(
      createPageDraft(
        A,
        actor,
        {
          action: "create",
          slug: "ghost",
          input: pageInput("x", [
            { id: "f", type: "featured_product", productId: ghost },
          ]),
        },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_reference" });
    await expect(
      createPageDraft(
        A,
        actor,
        {
          action: "create",
          slug: "ghost2",
          input: pageInput("x", [
            {
              id: "g",
              type: "product_grid",
              source: { by: "category", categoryId: ghost },
            },
          ]),
        },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_reference" });
    const p = await product(B, "של B");
    await expect(
      createPageDraft(
        A,
        actor,
        {
          action: "create",
          slug: "cross",
          input: pageInput("x", [
            { id: "f", type: "featured_product", productId: p.id },
          ]),
        },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_reference" }); // B's product is invisible to A
  });

  it("update_page draft: stale drafts are refused and stay pending with the reason", async () => {
    const page = await createPage(A, { slug: "about", title: "אודות" }, db);
    await savePage(A, page.id, pageInput("v1"), "user", db);
    const d = await createPageDraft(
      A,
      actor,
      { action: "update", pageId: page.id, input: pageInput("v2") },
      db,
    );
    expect(d.summary.join("\n")).toContain("עדכון העמוד");
    await savePage(
      A,
      page.id,
      pageInput("edited by a human meanwhile"),
      "user",
      db,
    );
    await expect(approveDraft(A, d.id, "user:u1", db)).rejects.toMatchObject({
      code: "stale",
    });
    const after = (await getDraft(A, d.id, db))!;
    expect(after.status).toBe("pending");
    expect(after.lastError).toContain("השתנה");
    await rejectDraft(A, d.id, "user:u1", db);
    expect((await getDraft(A, d.id, db))?.status).toBe("rejected");
  });

  it("update_product draft shows a readable diff; approval applies it; prices never change before approval", async () => {
    const p = await product(A, "חלה", "20", 5);
    const cur = (await getProduct(A, p.id, db))!;
    const v = cur.variants[0];
    const d = await createProductUpdateDraft(
      A,
      actor,
      p.id,
      { variants: [{ id: v.id, priceAgorot: 2500, stockQty: 9 }] },
      db,
    );
    expect(d.summary).toEqual(
      expect.arrayContaining([
        'מחיר "רגיל": ₪20.00 ← ₪25.00',
        'מלאי "רגיל": 5 ← 9',
      ]),
    );
    expect((await getProduct(A, p.id, db))!.variants[0].priceAgorot).toBe(2000);

    await approveDraft(A, d.id, "mcp:grant-1", db);
    const now = (await getProduct(A, p.id, db))!;
    expect([now.variants[0].priceAgorot, now.variants[0].stockQty]).toEqual([
      2500, 9,
    ]);
    const log = (
      await withStore(
        A,
        (tx) =>
          tx
            .select()
            .from(schema.auditLog)
            .where(eq(schema.auditLog.action, "product.update")),
        db,
      )
    ).at(-1)!;
    expect(log).toMatchObject({ actorType: "mcp", entity: "product" });
    expect(JSON.stringify(log.before)).toContain("2000");
    expect(JSON.stringify(log.after)).toContain("2500");
  });

  it("product drafts: unknown variants, no-op changes and invalid values are refused; another store's product is invisible", async () => {
    const p = await product(A, "בדיקה");
    await expect(
      createProductUpdateDraft(
        A,
        actor,
        p.id,
        {
          variants: [
            { id: "00000000-0000-4000-8000-0000000000bb", priceAgorot: 1 },
          ],
        },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_reference" });
    await expect(
      createProductUpdateDraft(A, actor, p.id, { title: "בדיקה" }, db),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      createProductUpdateDraft(A, actor, p.id, {}, db),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      createProductUpdateDraft(
        A,
        actor,
        p.id,
        {
          variants: [
            {
              id: (await getProduct(A, p.id, db))!.variants[0].id,
              priceAgorot: 100,
              compareAtAgorot: 50,
            },
          ],
        },
        db,
      ),
    ).rejects.toBeInstanceOf(DraftError); // compare-at must exceed price
    await expect(
      createProductUpdateDraft(B, actor, p.id, { title: "פריצה" }, db),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("product changes that became stale are refused", async () => {
    const p = await product(A, "ישן");
    const v = (await getProduct(A, p.id, db))!.variants[0];
    const d = await createProductUpdateDraft(
      A,
      actor,
      p.id,
      { variants: [{ id: v.id, priceAgorot: 3000 }] },
      db,
    );
    await withStore(
      A,
      (tx) =>
        tx
          .update(schema.products)
          .set({ updatedAt: new Date(Date.now() + 5000) })
          .where(eq(schema.products.id, p.id)),
      db,
    );
    await expect(approveDraft(A, d.id, "user:u1", db)).rejects.toMatchObject({
      code: "stale",
    });
    expect((await getProduct(A, p.id, db))!.variants[0].priceAgorot).toBe(2000);
  });

  it("discount draft → coupon exists only after approval; duplicate code fails without side effects", async () => {
    const d = await createDiscountDraft(
      A,
      actor,
      {
        code: "hanuka",
        type: "percent",
        value: 20,
        startsAt: null,
        endsAt: null,
        usageLimit: 50,
      },
      db,
    );
    expect((await listDiscounts(A, db)).some((x) => x.code === "HANUKA")).toBe(
      false,
    );
    await approveDraft(A, d.id, "user:u1", db);
    expect(
      (await listDiscounts(A, db)).find((x) => x.code === "HANUKA"),
    ).toMatchObject({ type: "percent", value: 20, usageLimit: 50 });
    const dup = await createDiscountDraft(
      A,
      actor,
      {
        code: "HANUKA",
        type: "fixed",
        value: 500,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
      },
      db,
    );
    await expect(approveDraft(A, dup.id, "user:u1", db)).rejects.toThrow();
    expect((await getDraft(A, dup.id, db))?.status).toBe("pending");
    await expect(
      createDiscountDraft(
        A,
        actor,
        {
          code: "x",
          type: "percent",
          value: 200,
          startsAt: null,
          endsAt: null,
          usageLimit: null,
        },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("campaign approves page + coupon together, all-or-nothing", async () => {
    const ok = await createCampaignDrafts(
      A,
      actor,
      {
        name: "פסח",
        page: { action: "create", slug: "pesach", input: pageInput("פסח שמח") },
        discount: {
          code: "PESACH",
          type: "percent",
          value: 15,
          startsAt: null,
          endsAt: null,
          usageLimit: null,
        },
      },
      db,
    );
    expect(ok.children).toHaveLength(2);
    await approveDraft(A, ok.parent.id, "user:u1", db);
    expect(await getPublishedPage(A, "pesach", db)).not.toBeNull();
    expect((await listDiscounts(A, db)).some((x) => x.code === "PESACH")).toBe(
      true,
    );
    expect(
      (await getDraft(A, ok.parent.id, db))!.children.every(
        (c) => c.status === "approved",
      ),
    ).toBe(true);

    // second campaign whose page slug gets taken before approval → nothing at all is applied
    const bad = await createCampaignDrafts(
      A,
      actor,
      {
        name: "שבועות",
        page: { action: "create", slug: "shavuot", input: pageInput("חג") },
        discount: {
          code: "SHAVUOT",
          type: "fixed",
          value: 1000,
          startsAt: null,
          endsAt: null,
          usageLimit: null,
        },
      },
      db,
    );
    await createPage(A, { slug: "shavuot", title: "תפוס" }, db);
    await expect(
      approveDraft(A, bad.parent.id, "user:u1", db),
    ).rejects.toThrow();
    expect((await listDiscounts(A, db)).some((x) => x.code === "SHAVUOT")).toBe(
      false,
    ); // rolled back
    expect((await getDraft(A, bad.parent.id, db))?.status).toBe("pending");

    await rejectDraft(A, bad.parent.id, "user:u1", db);
    expect(
      (await getDraft(A, bad.parent.id, db))!.children.every(
        (c) => c.status === "rejected",
      ),
    ).toBe(true);
    await expect(
      createCampaignDrafts(A, actor, { name: "ריק" }, db),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("expired drafts cannot be approved; concurrent approvals apply once; other stores see nothing", async () => {
    const d = await createDiscountDraft(
      A,
      actor,
      {
        code: "OLD1",
        type: "percent",
        value: 5,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
      },
      db,
    );
    await withStore(
      A,
      (tx) =>
        tx
          .update(schema.drafts)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(schema.drafts.id, d.id)),
      db,
    );
    await expect(approveDraft(A, d.id, "user:u1", db)).rejects.toMatchObject({
      code: "expired",
    });
    expect(
      (await listDrafts(A, { status: "expired" }, db)).some(
        (x) => x.id === d.id,
      ),
    ).toBe(true);

    const c = await createDiscountDraft(
      A,
      actor,
      {
        code: "RACE1",
        type: "percent",
        value: 5,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
      },
      db,
    );
    const results = await Promise.allSettled([
      approveDraft(A, c.id, "user:1", db),
      approveDraft(A, c.id, "user:2", db),
      approveDraft(A, c.id, "user:3", db),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await listDiscounts(A, db)).filter((x) => x.code === "RACE1"),
    ).toHaveLength(1);

    expect(await getDraft(B, c.id, db)).toBeNull();
    await expect(approveDraft(B, c.id, "user:u1", db)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(rejectDraft(B, c.id, "user:u1", db)).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await listDrafts(B, {}, db)).some((x) => x.id === c.id)).toBe(
      false,
    );
  });
});
