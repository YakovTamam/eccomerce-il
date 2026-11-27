"use server";

import { eq } from "drizzle-orm";
import { requireStoreAccess } from "@/lib/auth/access";
import { stores } from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import { invalidateStore } from "@/lib/storefront/revalidate";
import { themeSchema } from "@/lib/theme/theme";

export type DesignState = { error?: string; ok?: string };

export async function saveThemeAction(
  _p: DesignState,
  fd: FormData,
): Promise<DesignState> {
  const storeId = String(fd.get("storeId") ?? "");
  await requireStoreAccess(storeId);
  const parsed = themeSchema.safeParse({
    primaryColor: fd.get("primaryColor"),
    secondaryColor: fd.get("secondaryColor"),
    font: fd.get("font"),
    radius: fd.get("radius"),
    logoUrl: fd.get("logoUrl") ? fd.get("logoUrl") : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await withStore(storeId, async (tx) => {
    const [s] = await tx
      .select({ settings: stores.settings })
      .from(stores)
      .where(eq(stores.id, storeId));
    const settings = {
      ...((s?.settings as Record<string, unknown>) ?? {}),
      theme: parsed.data,
    };
    await tx.update(stores).set({ settings }).where(eq(stores.id, storeId));
  });
  invalidateStore(storeId);
  return { ok: "העיצוב נשמר" };
}
