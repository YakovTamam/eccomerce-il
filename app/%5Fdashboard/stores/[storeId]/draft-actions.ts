"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStoreAccess } from "@/lib/auth/access";
import { approveDraft, DraftError, rejectDraft } from "@/lib/drafts/service";
import { revokeGrant } from "@/lib/oauth/service";
import { recordAudit } from "@/lib/audit/log";
import { invalidateStore } from "@/lib/storefront/revalidate";

export type DraftState = { error?: string };
const uuid = z.string().uuid();
const sid = (fd: FormData) => String(fd.get("storeId") ?? "");

export async function approveDraftAction(
  _p: DraftState,
  fd: FormData,
): Promise<DraftState> {
  const storeId = sid(fd);
  const { user } = await requireStoreAccess(storeId);
  const id = uuid.safeParse(fd.get("draftId"));
  if (!id.success) return { error: "טיוטה לא תקינה" };
  try {
    await approveDraft(storeId, id.data, `user:${user.id}`);
  } catch (e) {
    if (e instanceof DraftError) return { error: e.message };
    throw e;
  }
  invalidateStore(storeId); // pages/prices/coupons changed
  redirect(`/stores/${storeId}/drafts/${id.data}`);
}

export async function rejectDraftAction(
  _p: DraftState,
  fd: FormData,
): Promise<DraftState> {
  const storeId = sid(fd);
  const { user } = await requireStoreAccess(storeId);
  const id = uuid.safeParse(fd.get("draftId"));
  if (!id.success) return { error: "טיוטה לא תקינה" };
  try {
    await rejectDraft(storeId, id.data, `user:${user.id}`);
  } catch (e) {
    if (e instanceof DraftError) return { error: e.message };
    throw e;
  }
  redirect(`/stores/${storeId}/drafts/${id.data}`);
}

export async function revokeConnectionAction(fd: FormData) {
  const storeId = sid(fd);
  const { user } = await requireStoreAccess(storeId);
  const id = uuid.safeParse(fd.get("grantId"));
  if (id.success) {
    await revokeGrant(storeId, id.data);
    await recordAudit(
      storeId,
      { type: "user", id: user.id },
      {
        action: "mcp.connection_revoked",
        entity: "oauth_grant",
        entityId: id.data,
      },
    );
  }
  redirect(`/stores/${storeId}/claude`);
}
