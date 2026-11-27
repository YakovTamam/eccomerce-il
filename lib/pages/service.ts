import { and, asc, desc, eq } from "drizzle-orm";
import { pages, pageVersions } from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import type { Db } from "@/lib/db/client";
import type { PageInput } from "@/lib/blocks/schemas";
import { blocksSchema, type Block } from "@/lib/blocks/schemas";

export class PageNotFoundError extends Error {}
export class SlugTakenError extends Error {}

type Actor = "user" | "mcp";

export function createPage(
  storeId: string,
  input: { slug: string; title: string },
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const [hit] = await tx
        .select({ id: pages.id })
        .from(pages)
        .where(eq(pages.slug, input.slug));
      if (hit) throw new SlugTakenError();
      const [p] = await tx
        .insert(pages)
        .values({ storeId, slug: input.slug, title: input.title })
        .returning();
      return p;
    },
    db,
  );
}

/** Every save creates a version (spec §6). Does NOT publish. */
export function savePage(
  storeId: string,
  pageId: string,
  input: PageInput,
  by: Actor = "user",
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const [p] = await tx
        .select({ id: pages.id })
        .from(pages)
        .where(eq(pages.id, pageId));
      if (!p) throw new PageNotFoundError();
      await tx
        .update(pages)
        .set({
          title: input.title,
          seo: input.seo,
          blocks: input.blocks,
          updatedAt: new Date(),
        })
        .where(eq(pages.id, pageId));
      const [v] = await tx
        .insert(pageVersions)
        .values({ storeId, pageId, blocks: input.blocks, createdBy: by })
        .returning();
      return v;
    },
    db,
  );
}

/** Publishing = pointing at a version. Rollback = publishing an earlier version. */
export function publishVersion(
  storeId: string,
  pageId: string,
  versionId: string,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const [v] = await tx
        .select({ id: pageVersions.id })
        .from(pageVersions)
        .where(
          and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)),
        );
      if (!v) throw new PageNotFoundError();
      const res = await tx
        .update(pages)
        .set({
          publishedVersionId: v.id,
          status: "published",
          updatedAt: new Date(),
        })
        .where(eq(pages.id, pageId))
        .returning({ id: pages.id });
      if (!res.length) throw new PageNotFoundError();
    },
    db,
  );
}

export function unpublishPage(storeId: string, pageId: string, db?: Db) {
  return withStore(
    storeId,
    (tx) =>
      tx
        .update(pages)
        .set({
          publishedVersionId: null,
          status: "draft",
          updatedAt: new Date(),
        })
        .where(eq(pages.id, pageId)),
    db,
  );
}

export function listPages(storeId: string, db?: Db) {
  return withStore(
    storeId,
    (tx) => tx.select().from(pages).orderBy(asc(pages.slug)),
    db,
  );
}

export function getPage(storeId: string, pageId: string, db?: Db) {
  return withStore(
    storeId,
    async (tx) => {
      const [p] = await tx.select().from(pages).where(eq(pages.id, pageId));
      if (!p) return null;
      const versions = await tx
        .select({
          id: pageVersions.id,
          createdAt: pageVersions.createdAt,
          createdBy: pageVersions.createdBy,
        })
        .from(pageVersions)
        .where(eq(pageVersions.pageId, pageId))
        .orderBy(desc(pageVersions.createdAt))
        .limit(50);
      return { ...p, versions };
    },
    db,
  );
}

export function getVersionBlocks(
  storeId: string,
  pageId: string,
  versionId: string,
  db?: Db,
) {
  return withStore(
    storeId,
    async (tx) => {
      const [v] = await tx
        .select({ blocks: pageVersions.blocks })
        .from(pageVersions)
        .where(
          and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)),
        );
      return v ? parseStoredBlocks(v.blocks) : null;
    },
    db,
  );
}

/** Published blocks of a page by slug, or null. Stored JSON is re-validated before use. */
export function getPublishedPage(storeId: string, slug: string, db?: Db) {
  return withStore(
    storeId,
    async (tx) => {
      const [p] = await tx
        .select()
        .from(pages)
        .where(and(eq(pages.slug, slug), eq(pages.status, "published")));
      if (!p?.publishedVersionId) return null;
      const [v] = await tx
        .select({ blocks: pageVersions.blocks })
        .from(pageVersions)
        .where(eq(pageVersions.id, p.publishedVersionId));
      if (!v) return null;
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        seo: p.seo,
        blocks: parseStoredBlocks(v.blocks),
      };
    },
    db,
  );
}

export function parseStoredBlocks(raw: unknown): Block[] {
  const r = blocksSchema.safeParse(raw);
  return r.success ? r.data : [];
}
