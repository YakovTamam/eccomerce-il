"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStoreAccess } from "@/lib/auth/access";
import { pageInputSchema, pageSlugSchema } from "@/lib/blocks/schemas";
import { invalidateStore } from "@/lib/storefront/revalidate";
import {
  createPage,
  getVersionBlocks,
  PageNotFoundError,
  publishVersion,
  savePage,
  SlugTakenError,
  unpublishPage,
} from "@/lib/pages/service";

export type PageFormState = { error?: string; ok?: string };

const uuid = z.string().uuid();
const storeIdOf = (fd: FormData) => String(fd.get("storeId") ?? "");

export async function createPageAction(
  _p: PageFormState,
  fd: FormData,
): Promise<PageFormState> {
  const storeId = storeIdOf(fd);
  await requireStoreAccess(storeId);
  const slug = pageSlugSchema.safeParse(fd.get("slug"));
  const title = z
    .string()
    .trim()
    .min(1, "נא להזין שם עמוד")
    .max(120)
    .safeParse(fd.get("title"));
  if (!slug.success) return { error: slug.error.issues[0].message };
  if (!title.success) return { error: title.error.issues[0].message };
  let id: string;
  try {
    id = (await createPage(storeId, { slug: slug.data, title: title.data })).id;
  } catch (e) {
    if (e instanceof SlugTakenError) return { error: "כתובת העמוד כבר קיימת" };
    throw e;
  }
  redirect(`/stores/${storeId}/pages/${id}`);
}

/** intent=save → new version (draft); intent=publish → new version + publish it. */
export async function savePageAction(
  _p: PageFormState,
  fd: FormData,
): Promise<PageFormState> {
  const storeId = storeIdOf(fd);
  await requireStoreAccess(storeId);
  const pageId = uuid.safeParse(fd.get("pageId"));
  if (!pageId.success) return { error: "עמוד לא תקין" };

  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("payload") ?? ""));
  } catch {
    return { error: "נתוני הטופס פגומים" };
  }
  const parsed = pageInputSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return {
      error:
        i.message === "Invalid input"
          ? `שדה לא תקין (${i.path.join(".")})`
          : i.message,
    };
  }
  try {
    const v = await savePage(storeId, pageId.data, parsed.data, "user");
    if (fd.get("intent") === "publish")
      await publishVersion(storeId, pageId.data, v.id);
  } catch (e) {
    if (e instanceof PageNotFoundError) return { error: "העמוד לא נמצא" };
    throw e;
  }
  invalidateStore(storeId);
  return {
    ok: fd.get("intent") === "publish" ? "העמוד פורסם" : "הטיוטה נשמרה",
  };
}

export async function publishVersionAction(fd: FormData) {
  const storeId = storeIdOf(fd);
  await requireStoreAccess(storeId);
  const pageId = uuid.safeParse(fd.get("pageId"));
  const versionId = uuid.safeParse(fd.get("versionId"));
  if (!pageId.success || !versionId.success) return;
  await publishVersion(storeId, pageId.data, versionId.data);
  invalidateStore(storeId);
  redirect(`/stores/${storeId}/pages/${pageId.data}`);
}

export async function unpublishAction(fd: FormData) {
  const storeId = storeIdOf(fd);
  await requireStoreAccess(storeId);
  const pageId = uuid.safeParse(fd.get("pageId"));
  if (!pageId.success) return;
  await unpublishPage(storeId, pageId.data);
  invalidateStore(storeId);
  redirect(`/stores/${storeId}/pages/${pageId.data}`);
}

/** Load an old version into the editor as a NEW draft version (history is never rewritten). */
export async function restoreVersionAction(fd: FormData) {
  const storeId = storeIdOf(fd);
  await requireStoreAccess(storeId);
  const pageId = uuid.safeParse(fd.get("pageId"));
  const versionId = uuid.safeParse(fd.get("versionId"));
  if (!pageId.success || !versionId.success) return;
  const blocks = await getVersionBlocks(storeId, pageId.data, versionId.data);
  if (!blocks) return;
  const title = String(fd.get("title") ?? "עמוד");
  await savePage(storeId, pageId.data, { title, seo: {}, blocks }, "user");
  redirect(`/stores/${storeId}/pages/${pageId.data}`);
}
