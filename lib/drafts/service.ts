import { and, desc, eq, inArray } from "drizzle-orm";
import { categories, drafts, pages, products } from "@/lib/db/schema";
import { withStore, type StoreTx } from "@/lib/db/with-store";
import type { Db } from "@/lib/db/client";
import { audit, type Actor } from "@/lib/audit/log";
import type { Block, PageInput } from "@/lib/blocks/schemas";
import { productSchema } from "@/lib/catalog/schemas";
import { getProduct, updateProduct } from "@/lib/catalog/service";
import { createDiscount, discountInputSchema } from "@/lib/discounts/service";
import {
  createPage,
  getPage,
  parseStoredBlocks,
  publishVersion,
  savePage,
} from "@/lib/pages/service";
import { signPreviewToken } from "@/lib/preview/token";
import { oauthUrls } from "@/lib/oauth/config";
import {
  discountSummary,
  pageCreateSummary,
  pageUpdateSummary,
  productUpdateSummary,
} from "./diff";
import {
  campaignPayloadSchema,
  discountPayloadSchema,
  pagePayloadSchema,
  productChangesSchema,
  productUpdatePayloadSchema,
  type DiscountPayload,
  type ProductChanges,
} from "./schemas";

export const DRAFT_TTL_MS = 7 * 86_400_000;

export class DraftError extends Error {
  constructor(
    public code:
      | "not_found"
      | "not_pending"
      | "expired"
      | "stale"
      | "invalid_reference"
      | "invalid",
    message: string,
  ) {
    super(message);
  }
}

type DraftActor = { createdBy: "mcp" | "ai_agent" | "user"; ref?: string };
const auditActor = (a: DraftActor): Actor => ({ type: a.createdBy, id: a.ref });

// ── reference checks (models hallucinate ids; never trust them) ───────────────
export async function assertBlockReferences(tx: StoreTx, blocks: Block[]) {
  const productIds = new Set<string>();
  const categoryIds = new Set<string>();
  for (const b of blocks) {
    if (b.type === "featured_product") productIds.add(b.productId);
    if (b.type === "product_grid") {
      if (b.source.by === "products")
        b.source.productIds.forEach((i) => productIds.add(i));
      if (b.source.by === "category") categoryIds.add(b.source.categoryId);
    }
  }
  if (productIds.size) {
    const found = new Set(
      (
        await tx
          .select({ id: products.id })
          .from(products)
          .where(inArray(products.id, [...productIds]))
      ).map((r) => r.id),
    );
    const missing = [...productIds].filter((i) => !found.has(i));
    if (missing.length)
      throw new DraftError(
        "invalid_reference",
        `מוצרים לא קיימים בחנות: ${missing.join(", ")}`,
      );
  }
  if (categoryIds.size) {
    const found = new Set(
      (
        await tx
          .select({ id: categories.id })
          .from(categories)
          .where(inArray(categories.id, [...categoryIds]))
      ).map((r) => r.id),
    );
    const missing = [...categoryIds].filter((i) => !found.has(i));
    if (missing.length)
      throw new DraftError(
        "invalid_reference",
        `קטגוריות לא קיימות בחנות: ${missing.join(", ")}`,
      );
  }
}

function newDraft(
  storeId: string,
  a: DraftActor,
  d: {
    kind: "page" | "discount" | "product_update" | "campaign";
    title: string;
    summary: string[];
    payload: unknown;
    parentId?: string;
  },
) {
  return {
    storeId,
    kind: d.kind,
    parentId: d.parentId ?? null,
    title: d.title,
    summary: d.summary,
    payload: d.payload as object,
    createdBy: a.createdBy,
    createdByRef: a.ref ?? null,
    expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
  };
}

// ── creation (nothing changes in the live store) ──────────────────────────────
type PageDraftInput =
  | { action: "create"; slug: string; input: PageInput }
  | { action: "update"; pageId: string; input: PageInput };

async function insertPageDraft(
  tx: StoreTx,
  storeId: string,
  a: DraftActor,
  p: PageDraftInput,
  parentId?: string,
) {
  await assertBlockReferences(tx, p.input.blocks);
  let payload: unknown;
  let summary: string[];
  if (p.action === "create") {
    const [hit] = await tx
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.slug, p.slug));
    if (hit)
      throw new DraftError(
        "invalid",
        `כבר קיים עמוד בכתובת "${p.slug}". השתמשו בעדכון עמוד.`,
      );
    payload = { action: "create", slug: p.slug, input: p.input };
    summary = pageCreateSummary(p.input.title, p.slug, p.input.blocks);
  } else {
    const [cur] = await tx.select().from(pages).where(eq(pages.id, p.pageId));
    if (!cur) throw new DraftError("not_found", "העמוד לא נמצא");
    payload = {
      action: "update",
      pageId: p.pageId,
      baseUpdatedAt: cur.updatedAt.toISOString(),
      input: p.input,
    };
    summary = pageUpdateSummary(
      p.input.title,
      parseStoredBlocks(cur.blocks),
      p.input.blocks,
    );
  }
  pagePayloadSchema.parse(payload);
  const [d] = await tx
    .insert(drafts)
    .values(
      newDraft(storeId, a, {
        kind: "page",
        title: p.input.title,
        summary,
        payload,
        parentId,
      }),
    )
    .returning();
  await audit(tx, storeId, auditActor(a), {
    action: "draft.create",
    entity: "draft",
    entityId: d.id,
    after: { kind: "page", title: d.title },
  });
  return d;
}

async function insertDiscountDraft(
  tx: StoreTx,
  storeId: string,
  a: DraftActor,
  input: DiscountPayload["input"],
  parentId?: string,
) {
  const code = input.code.trim().toUpperCase();
  const check = discountInputSchema.safeParse({
    ...input,
    code,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
  });
  if (!check.success)
    throw new DraftError("invalid", check.error.issues[0].message);
  const payload = { input: { ...input, code } };
  const [d] = await tx
    .insert(drafts)
    .values(
      newDraft(storeId, a, {
        kind: "discount",
        title: `קופון ${code}`,
        summary: discountSummary(payload.input),
        payload,
        parentId,
      }),
    )
    .returning();
  await audit(tx, storeId, auditActor(a), {
    action: "draft.create",
    entity: "draft",
    entityId: d.id,
    after: { kind: "discount", code },
  });
  return d;
}

export const createPageDraft = (
  storeId: string,
  a: DraftActor,
  p: PageDraftInput,
  db?: Db,
) => withStore(storeId, (tx) => insertPageDraft(tx, storeId, a, p), db);
export const createDiscountDraft = (
  storeId: string,
  a: DraftActor,
  input: DiscountPayload["input"],
  db?: Db,
) => withStore(storeId, (tx) => insertDiscountDraft(tx, storeId, a, input), db);

export function createProductUpdateDraft(
  storeId: string,
  a: DraftActor,
  productId: string,
  changesRaw: unknown,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const changes = productChangesSchema.safeParse(changesRaw);
      if (!changes.success)
        throw new DraftError("invalid", changes.error.issues[0].message);
      const cur = await getProduct(storeId, productId);
      if (!cur) throw new DraftError("not_found", "המוצר לא נמצא");
      const unknown = (changes.data.variants ?? []).filter(
        (p) => !cur.variants.some((v) => v.id === p.id),
      );
      if (unknown.length)
        throw new DraftError(
          "invalid_reference",
          `וריאציות לא קיימות במוצר: ${unknown.map((u) => u.id).join(", ")}`,
        );
      mergeProductChanges(cur, changes.data); // dry-run: must produce a valid product
      const summary = productUpdateSummary(cur, changes.data);
      if (summary.length < 2)
        throw new DraftError("invalid", "השינויים המבוקשים זהים למצב הנוכחי");
      const payload = {
        productId,
        baseUpdatedAt: cur.updatedAt.toISOString(),
        changes: changes.data,
      };
      const [d] = await tx
        .insert(drafts)
        .values(
          newDraft(storeId, a, {
            kind: "product_update",
            title: `עדכון מוצר: ${cur.title}`,
            summary,
            payload,
          }),
        )
        .returning();
      await audit(tx, storeId, auditActor(a), {
        action: "draft.create",
        entity: "draft",
        entityId: d.id,
        after: { kind: "product_update", productId },
      });
      return d;
    },
    db,
  );
}

/** Campaign = a parent draft + child drafts (landing page and/or coupon) approved or rejected together. */
export function createCampaignDrafts(
  storeId: string,
  a: DraftActor,
  c: {
    name: string;
    page?: PageDraftInput;
    discount?: DiscountPayload["input"];
  },
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      if (!c.page && !c.discount)
        throw new DraftError("invalid", "קמפיין חייב לכלול עמוד או קופון");
      const [parent] = await tx
        .insert(drafts)
        .values(
          newDraft(storeId, a, {
            kind: "campaign",
            title: `קמפיין: ${c.name}`,
            summary: [],
            payload: { name: c.name, childIds: [] },
          }),
        )
        .returning();
      const children = [];
      if (c.discount)
        children.push(
          await insertDiscountDraft(tx, storeId, a, c.discount, parent.id),
        );
      if (c.page)
        children.push(await insertPageDraft(tx, storeId, a, c.page, parent.id));
      const summary = [
        `קמפיין "${c.name}" — ${children.length} פעולות שיאושרו יחד:`,
        ...children.map((ch) => `• ${ch.title}`),
      ];
      const [updated] = await tx
        .update(drafts)
        .set({
          summary,
          payload: { name: c.name, childIds: children.map((x) => x.id) },
        })
        .where(eq(drafts.id, parent.id))
        .returning();
      await audit(tx, storeId, auditActor(a), {
        action: "draft.create",
        entity: "draft",
        entityId: parent.id,
        after: { kind: "campaign", name: c.name },
      });
      return { parent: updated, children };
    },
    db,
  );
}

// ── reading ───────────────────────────────────────────────────────────────────
export const effectiveStatus = (d: { status: string; expiresAt: Date }) =>
  d.status === "pending" && d.expiresAt < new Date() ? "expired" : d.status;

export function listDrafts(
  storeId: string,
  filter: { status?: "pending" | "approved" | "rejected" | "expired" } = {},
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const rows = await tx
        .select()
        .from(drafts)
        .orderBy(desc(drafts.createdAt))
        .limit(200);
      const withStatus = rows.map((d) => ({
        ...d,
        effectiveStatus: effectiveStatus(d),
      }));
      return filter.status
        ? withStatus.filter((d) => d.effectiveStatus === filter.status)
        : withStatus;
    },
    db,
  );
}

export function getDraft(storeId: string, id: string, db?: Db) {
  return withStore(
    storeId,
    async (tx) => {
      const [d] = await tx.select().from(drafts).where(eq(drafts.id, id));
      if (!d) return null;
      const children =
        d.kind === "campaign"
          ? await tx.select().from(drafts).where(eq(drafts.parentId, id))
          : [];
      return { ...d, effectiveStatus: effectiveStatus(d), children };
    },
    db,
  );
}

export function pendingDraftCount(storeId: string, db?: Db) {
  return withStore(
    storeId,
    async (tx) =>
      (
        await tx
          .select({ id: drafts.id, expiresAt: drafts.expiresAt })
          .from(drafts)
          .where(eq(drafts.status, "pending"))
      ).filter((d) => d.expiresAt >= new Date()).length,
    db,
  );
}

/** Preview link for page drafts (signed, expiring). */
export function draftPreviewUrl(
  storeId: string,
  draftId: string,
  ttlSeconds = 86_400,
) {
  return `${oauthUrls().issuer}/preview/draft/${draftId}?t=${signPreviewToken({ storeId, kind: "draft", id: draftId }, ttlSeconds)}`;
}

// ── applying ──────────────────────────────────────────────────────────────────
export function mergeProductChanges(
  cur: NonNullable<Awaited<ReturnType<typeof getProduct>>>,
  c: ProductChanges,
) {
  const patches = new Map((c.variants ?? []).map((p) => [p.id, p]));
  const merged = {
    title: c.title ?? cur.title,
    descriptionMd: c.descriptionMd ?? cur.descriptionMd,
    status: c.status ?? cur.status,
    categoryId: c.categoryId === undefined ? cur.categoryId : c.categoryId,
    images: cur.images,
    variants: cur.variants.map((v) => {
      const p = patches.get(v.id);
      return {
        id: v.id,
        sku: p?.sku === undefined ? v.sku : p.sku,
        title: p?.title ?? v.title,
        options: v.options,
        priceAgorot: p?.priceAgorot ?? v.priceAgorot,
        compareAtAgorot:
          p?.compareAtAgorot === undefined
            ? v.compareAtAgorot
            : p.compareAtAgorot,
        stockQty: p?.stockQty ?? v.stockQty,
        trackStock: p?.trackStock ?? v.trackStock,
      };
    }),
  };
  const r = productSchema.safeParse(merged);
  if (!r.success) throw new DraftError("invalid", r.error.issues[0].message);
  return r.data;
}

async function applyDraftTx(
  tx: StoreTx,
  storeId: string,
  d: typeof drafts.$inferSelect,
  decidedBy: string,
): Promise<{ entity: string; entityId: string | null }> {
  const mcpActor: Actor = {
    type: d.createdBy === "user" ? "user" : d.createdBy,
    id: d.createdByRef ?? undefined,
  };
  switch (d.kind) {
    case "page": {
      const p = pagePayloadSchema.parse(d.payload);
      await assertBlockReferences(tx, p.input.blocks);
      if (p.action === "create") {
        const page = await createPage(storeId, {
          slug: p.slug,
          title: p.input.title,
        });
        const v = await savePage(storeId, page.id, p.input, "mcp");
        await publishVersion(storeId, page.id, v.id);
        await audit(tx, storeId, mcpActor, {
          action: "page.create_published",
          entity: "page",
          entityId: page.id,
          after: {
            slug: p.slug,
            title: p.input.title,
            blocks: p.input.blocks.length,
          },
        });
        return { entity: "page", entityId: page.id };
      }
      const cur = await getPage(storeId, p.pageId);
      if (!cur)
        throw new DraftError("not_found", "העמוד נמחק מאז יצירת הטיוטה");
      if (cur.updatedAt.toISOString() !== p.baseUpdatedAt)
        throw new DraftError(
          "stale",
          "העמוד השתנה מאז יצירת הטיוטה. דחו אותה וצרו טיוטה חדשה.",
        );
      const v = await savePage(storeId, p.pageId, p.input, "mcp");
      await publishVersion(storeId, p.pageId, v.id);
      await audit(tx, storeId, mcpActor, {
        action: "page.update_published",
        entity: "page",
        entityId: p.pageId,
        before: {
          blocks: parseStoredBlocks(cur.blocks).length,
          title: cur.title,
        },
        after: { blocks: p.input.blocks.length, title: p.input.title },
      });
      return { entity: "page", entityId: p.pageId };
    }
    case "discount": {
      const { input } = discountPayloadSchema.parse(d.payload);
      const parsed = discountInputSchema.parse({
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      });
      const created = await createDiscount(storeId, parsed);
      await audit(tx, storeId, mcpActor, {
        action: "discount.create",
        entity: "discount",
        entityId: created.id,
        after: { code: created.code, type: created.type, value: created.value },
      });
      return { entity: "discount", entityId: created.id };
    }
    case "product_update": {
      const p = productUpdatePayloadSchema.parse(d.payload);
      const cur = await getProduct(storeId, p.productId);
      if (!cur)
        throw new DraftError("not_found", "המוצר נמחק מאז יצירת הטיוטה");
      if (cur.updatedAt.toISOString() !== p.baseUpdatedAt)
        throw new DraftError(
          "stale",
          "המוצר השתנה מאז יצירת הטיוטה. דחו אותה וצרו טיוטה חדשה.",
        );
      const merged = mergeProductChanges(cur, p.changes);
      await updateProduct(storeId, p.productId, merged);
      await audit(tx, storeId, mcpActor, {
        action: "product.update",
        entity: "product",
        entityId: p.productId,
        before: {
          title: cur.title,
          status: cur.status,
          variants: cur.variants.map((v) => ({
            id: v.id,
            price_agorot: v.priceAgorot,
            stock_qty: v.stockQty,
          })),
        },
        after: {
          title: merged.title,
          status: merged.status,
          variants: merged.variants.map((v) => ({
            id: v.id,
            price_agorot: v.priceAgorot,
            stock_qty: v.stockQty,
          })),
        },
      });
      return { entity: "product", entityId: p.productId };
    }
    case "campaign": {
      const { childIds } = campaignPayloadSchema.parse(d.payload);
      const children = childIds.length
        ? await tx.select().from(drafts).where(inArray(drafts.id, childIds))
        : [];
      for (const id of childIds) {
        const ch = children.find((c) => c.id === id);
        if (ch?.status === "pending")
          await approveInTx(tx, storeId, ch.id, decidedBy);
      }
      return { entity: "campaign", entityId: d.id };
    }
  }
}

async function approveInTx(
  tx: StoreTx,
  storeId: string,
  draftId: string,
  decidedBy: string,
) {
  const [d] = await tx
    .select()
    .from(drafts)
    .where(eq(drafts.id, draftId))
    .for("update");
  if (!d) throw new DraftError("not_found", "הטיוטה לא נמצאה");
  if (d.status !== "pending")
    throw new DraftError("not_pending", `הטיוטה כבר במצב "${d.status}"`);
  if (d.expiresAt < new Date())
    throw new DraftError("expired", "תוקף הטיוטה פג. צרו טיוטה חדשה.");
  const applied = await applyDraftTx(tx, storeId, d, decidedBy);
  await tx
    .update(drafts)
    .set({
      status: "approved",
      decidedAt: new Date(),
      decidedBy,
      lastError: null,
    })
    .where(eq(drafts.id, draftId));
  await audit(
    tx,
    storeId,
    {
      type: decidedBy.startsWith("user:") ? "user" : "mcp",
      id: decidedBy.replace(/^(user|mcp):/, ""),
    },
    {
      action: "draft.approve",
      entity: "draft",
      entityId: draftId,
      after: { kind: d.kind, applied },
    },
  );
  return { kind: d.kind, ...applied };
}

/**
 * Approves a draft and applies it. Atomic: the change, the draft status and the audit entries commit
 * together (campaigns apply all their children in the same transaction). `decidedBy`: "user:<id>" | "mcp:<grantId>".
 */
export async function approveDraft(
  storeId: string,
  draftId: string,
  decidedBy: string,
  db?: Db,
) {
  try {
    return await withStore(
      storeId,
      (tx) => approveInTx(tx, storeId, draftId, decidedBy),
      db,
    );
  } catch (e) {
    if (e instanceof DraftError && e.code !== "not_found") {
      // keep the reason visible on the draft (separate transaction; the failed one rolled back)
      await withStore(
        storeId,
        (tx) =>
          tx
            .update(drafts)
            .set({ lastError: e.message })
            .where(and(eq(drafts.id, draftId), eq(drafts.status, "pending"))),
        db,
      );
    }
    throw e;
  }
}

export function rejectDraft(
  storeId: string,
  draftId: string,
  decidedBy: string,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const [d] = await tx
        .select()
        .from(drafts)
        .where(eq(drafts.id, draftId))
        .for("update");
      if (!d) throw new DraftError("not_found", "הטיוטה לא נמצאה");
      if (d.status !== "pending")
        throw new DraftError("not_pending", `הטיוטה כבר במצב "${d.status}"`);
      const ids =
        d.kind === "campaign"
          ? [
              d.id,
              ...(
                await tx
                  .select({ id: drafts.id })
                  .from(drafts)
                  .where(
                    and(
                      eq(drafts.parentId, d.id),
                      eq(drafts.status, "pending"),
                    ),
                  )
              ).map((c) => c.id),
            ]
          : [d.id];
      await tx
        .update(drafts)
        .set({ status: "rejected", decidedAt: new Date(), decidedBy })
        .where(inArray(drafts.id, ids));
      await audit(
        tx,
        storeId,
        {
          type: decidedBy.startsWith("user:") ? "user" : "mcp",
          id: decidedBy.replace(/^(user|mcp):/, ""),
        },
        {
          action: "draft.reject",
          entity: "draft",
          entityId: draftId,
          after: { kind: d.kind },
        },
      );
    },
    db,
  );
}
