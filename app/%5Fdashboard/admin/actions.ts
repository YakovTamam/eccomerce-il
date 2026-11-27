"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/admin/auth";
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
} from "@/lib/admin/service";
import { invalidateStore } from "@/lib/storefront/revalidate";

export type AState = { error?: string; ok?: string };
const uuid = z.string().uuid();
const id = (fd: FormData, k: string) => uuid.parse(fd.get(k));

async function run(fn: () => Promise<string | void>): Promise<AState> {
  try {
    return { ok: (await fn()) || "נשמר" };
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message };
    if (e instanceof z.ZodError)
      return { error: e.issues[0]?.message ?? "קלט לא תקין" };
    throw e;
  }
}

export async function suspendStoreAction(
  _p: AState,
  fd: FormData,
): Promise<AState> {
  const admin = await requirePlatformAdmin();
  const storeId = id(fd, "storeId");
  const r = await run(async () => {
    await setStoreStatus(
      admin.id,
      storeId,
      "suspended",
      String(fd.get("reason") ?? ""),
    );
    return "החנות הושעתה";
  });
  if (r.ok) invalidateStore(storeId); // storefront stops serving immediately
  revalidatePath(`/admin/stores/${storeId}`);
  return r;
}

export async function activateStoreAction(fd: FormData) {
  const admin = await requirePlatformAdmin();
  const storeId = id(fd, "storeId");
  await setStoreStatus(admin.id, storeId, "active", "");
  invalidateStore(storeId);
  revalidatePath(`/admin/stores/${storeId}`);
}

export async function planAction(_p: AState, fd: FormData): Promise<AState> {
  const admin = await requirePlatformAdmin();
  const storeId = id(fd, "storeId");
  const r = await run(async () => {
    await setStorePlan(admin.id, storeId, fd.get("plan") as "basic");
    return "התוכנית עודכנה";
  });
  revalidatePath(`/admin/stores/${storeId}`);
  return r;
}

export async function addDomainAction(
  _p: AState,
  fd: FormData,
): Promise<AState> {
  const admin = await requirePlatformAdmin();
  const storeId = id(fd, "storeId");
  const r = await run(async () => {
    await addDomain(admin.id, storeId, String(fd.get("hostname") ?? ""));
    return "הדומיין נוסף וממתין לאימות";
  });
  revalidatePath(`/admin/stores/${storeId}`);
  revalidatePath("/admin/domains");
  return r;
}

async function domainOp(
  fd: FormData,
  op: (adminId: string, domainId: string) => Promise<string>,
) {
  const admin = await requirePlatformAdmin();
  const storeId = await op(admin.id, id(fd, "domainId"));
  invalidateStore(storeId); // canonical URLs / host resolution changed
  revalidatePath("/admin/domains");
  revalidatePath(`/admin/stores/${storeId}`);
}
export async function verifyDomainAction(fd: FormData) {
  await domainOp(fd, (a, d) => setDomainVerified(a, d, true));
}
export async function unverifyDomainAction(fd: FormData) {
  await domainOp(fd, (a, d) => setDomainVerified(a, d, false));
}
export async function primaryDomainAction(fd: FormData) {
  await domainOp(fd, (a, d) => setPrimaryDomain(a, d));
}
export async function removeDomainAction(fd: FormData) {
  await domainOp(fd, (a, d) => removeDomain(a, d));
}

export async function whatsappAction(
  _p: AState,
  fd: FormData,
): Promise<AState> {
  const admin = await requirePlatformAdmin();
  const storeId = id(fd, "storeId");
  const r = await run(async () => {
    await saveWhatsappAccount(admin.id, storeId, {
      phoneNumberId: fd.get("phoneNumberId"),
      wabaId: fd.get("wabaId"),
      displayPhone: fd.get("displayPhone"),
      accessToken: String(fd.get("accessToken") ?? "").trim() || undefined,
      status: fd.get("status"),
    });
    return "חשבון הוואטסאפ נשמר";
  });
  revalidatePath(`/admin/stores/${storeId}`);
  return r;
}

export async function retryJobAction(fd: FormData) {
  const admin = await requirePlatformAdmin();
  await retryJob(admin.id, id(fd, "jobId")).catch((e) => {
    if (!(e instanceof AdminError)) throw e;
  });
  revalidatePath("/admin/system");
}

export async function revokeAllAction(fd: FormData) {
  const admin = await requirePlatformAdmin();
  const storeId = id(fd, "storeId");
  await revokeAllConnections(admin.id, storeId);
  revalidatePath(`/admin/stores/${storeId}`);
}
