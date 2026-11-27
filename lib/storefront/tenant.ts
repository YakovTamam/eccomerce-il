import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getRootDomains, resolveHost } from "@/lib/tenancy/resolve-host";
import { getStorefrontStore, type StorefrontStore } from "./data";
import { storeBaseUrl } from "./urls";

/** Store of the current request, derived from the Host header (never from client-supplied ids). */
export async function currentStore(): Promise<StorefrontStore> {
  const h = await headers();
  const target = resolveHost(
    h.get("x-forwarded-host") ?? h.get("host") ?? "",
    getRootDomains(),
  );
  const key =
    target.kind === "store"
      ? target.slug
      : target.kind === "custom"
        ? target.hostname
        : null;
  if (!key) notFound();
  const store = await getStorefrontStore(key);
  if (!store) notFound();
  return store;
}

/** Public base URL for redirects back to this store (host-bound, so it works in dev and prod). */
export async function currentBaseUrl(store: StorefrontStore): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return host ? `${proto}://${host}` : storeBaseUrl(store);
}

const CART_COOKIE = "cart";
const uuid = z.string().uuid();

export async function readCartId(): Promise<string | null> {
  const v = (await cookies()).get(CART_COOKIE)?.value;
  return v && uuid.safeParse(v).success ? v : null;
}

export async function writeCartId(id: string) {
  (await cookies()).set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 86_400,
  });
}
