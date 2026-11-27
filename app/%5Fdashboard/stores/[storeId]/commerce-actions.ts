"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStoreAccess } from "@/lib/auth/access";
import { eq } from "drizzle-orm";
import { stores } from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import {
  createDiscount,
  DiscountCodeTakenError,
  discountInputSchema,
  setDiscountStatus,
} from "@/lib/discounts/service";
import { OrderError, refundOrder, setOrderStatus } from "@/lib/orders/service";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { shippingSettingsSchema } from "@/lib/shipping/settings";
import { shekelsToAgorot } from "@/lib/catalog/money";
import { invalidateStore } from "@/lib/storefront/revalidate";

export type CState = { error?: string; ok?: string };
const uuid = z.string().uuid();
const sid = (fd: FormData) => String(fd.get("storeId") ?? "");

const optDate = (v: FormDataEntryValue | null) =>
  typeof v === "string" && v ? new Date(v) : null;

export async function createDiscountAction(
  _p: CState,
  fd: FormData,
): Promise<CState> {
  const storeId = sid(fd);
  await requireStoreAccess(storeId);
  const type = String(fd.get("type"));
  const rawValue = String(fd.get("value") ?? "").trim();
  // percent → whole number; fixed → shekels converted to agorot with integer math
  const value =
    type === "free_shipping"
      ? 0
      : type === "fixed"
        ? shekelsToAgorot(rawValue)
        : /^\d{1,3}$/.test(rawValue)
          ? Number(rawValue)
          : null;
  if (value === null)
    return {
      error: type === "fixed" ? "סכום הנחה לא תקין" : "אחוז הנחה לא תקין",
    };
  const parsed = discountInputSchema.safeParse({
    code: fd.get("code"),
    type,
    value,
    startsAt: optDate(fd.get("startsAt")),
    endsAt: optDate(fd.get("endsAt")),
    usageLimit: fd.get("usageLimit") ? Number(fd.get("usageLimit")) : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createDiscount(storeId, parsed.data);
  } catch (e) {
    if (e instanceof DiscountCodeTakenError) return { error: "הקוד כבר קיים" };
    throw e;
  }
  redirect(`/stores/${storeId}/discounts`);
}

export async function toggleDiscountAction(fd: FormData) {
  const storeId = sid(fd);
  await requireStoreAccess(storeId);
  const id = uuid.safeParse(fd.get("id"));
  const status = z.enum(["active", "disabled"]).safeParse(fd.get("status"));
  if (id.success && status.success)
    await setDiscountStatus(storeId, id.data, status.data);
  redirect(`/stores/${storeId}/discounts`);
}

export async function setOrderStatusAction(
  _p: CState,
  fd: FormData,
): Promise<CState> {
  const storeId = sid(fd);
  await requireStoreAccess(storeId);
  const id = uuid.safeParse(fd.get("orderId"));
  const to = z.enum(ORDER_STATUSES).safeParse(fd.get("status"));
  if (!id.success || !to.success) return { error: "נתונים לא תקינים" };
  try {
    await setOrderStatus(storeId, id.data, to.data);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    throw e;
  }
  return { ok: "הסטטוס עודכן" };
}

export async function refundOrderAction(
  _p: CState,
  fd: FormData,
): Promise<CState> {
  const storeId = sid(fd);
  await requireStoreAccess(storeId);
  const id = uuid.safeParse(fd.get("orderId"));
  if (!id.success) return { error: "הזמנה לא תקינה" };
  try {
    await refundOrder(storeId, id.data);
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    console.error("refund failed", e);
    return { error: "ההחזר נכשל אצל ספק התשלום. ההזמנה לא שונתה." };
  }
  invalidateStore(storeId); // stock was restored
  return { ok: "ההחזר בוצע והמלאי הוחזר" };
}

export async function saveShippingAction(
  _p: CState,
  fd: FormData,
): Promise<CState> {
  const storeId = sid(fd);
  await requireStoreAccess(storeId);
  const flat = shekelsToAgorot(String(fd.get("flatRate") ?? ""));
  const freeRaw = String(fd.get("freeOver") ?? "").trim();
  const free = freeRaw === "" ? null : shekelsToAgorot(freeRaw);
  if (flat === null || (freeRaw !== "" && free === null))
    return { error: "סכומים לא תקינים" };
  const parsed = shippingSettingsSchema.safeParse({
    pickupEnabled: fd.get("pickupEnabled") === "on",
    pickupAddress: fd.get("pickupAddress") ?? "",
    deliveryEnabled: fd.get("deliveryEnabled") === "on",
    flatRateAgorot: flat,
    freeOverAgorot: free,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!parsed.data.pickupEnabled && !parsed.data.deliveryEnabled)
    return { error: "יש להפעיל לפחות שיטת קבלה אחת" };
  await withStore(storeId, async (tx) => {
    const [s] = await tx
      .select({ settings: stores.settings })
      .from(stores)
      .where(eq(stores.id, storeId));
    await tx
      .update(stores)
      .set({
        settings: {
          ...((s?.settings as Record<string, unknown>) ?? {}),
          shipping: parsed.data,
        },
      })
      .where(eq(stores.id, storeId));
  });
  invalidateStore(storeId);
  return { ok: "הגדרות המשלוח נשמרו" };
}
