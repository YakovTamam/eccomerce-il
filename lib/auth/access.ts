import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getStoreStatus, isMemberOfStore } from "@/lib/tenancy/stores";
import { getSession } from "./session";

/**
 * Every dashboard page, server action and upload route calls this first:
 * the user must be signed in AND a member of the store (never trust the URL's storeId).
 */
export async function requireStoreAccess(storeId: string) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!z.string().uuid().safeParse(storeId).success) notFound();
  const role = await isMemberOfStore(session.user.id, storeId);
  if (!role) notFound();
  // A suspended store keeps its data but nobody manages it until a platform admin reactivates it.
  if ((await getStoreStatus(storeId)) === "suspended") redirect("/suspended");
  return { user: session.user, role, storeId };
}
