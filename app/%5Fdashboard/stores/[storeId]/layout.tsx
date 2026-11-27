import { Suspense } from "react";
import Link from "next/link";
import { requireStoreAccess } from "@/lib/auth/access";
import { withStore } from "@/lib/db/with-store";
import { stores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function Shell({
  params,
  children,
}: {
  params: Promise<{ storeId: string }>;
  children: React.ReactNode;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const [store] = await withStore(storeId, (tx) =>
    tx.select().from(stores).where(eq(stores.id, storeId)),
  );
  const base = `/stores/${storeId}`;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-300 pb-4">
        <Link href="/" className="underline">
          כל החנויות
        </Link>
        <strong className="text-lg">{store?.name}</strong>
        <nav aria-label="ניהול החנות" className="flex gap-4">
          <a href={`${base}/products`} className="underline">
            מוצרים
          </a>
          <a href={`${base}/categories`} className="underline">
            קטגוריות
          </a>
        </nav>
      </header>
      {children}
    </div>
  );
}

export default function StoreLayout({
  params,
  children,
}: {
  params: Promise<{ storeId: string }>;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<p className="p-6">טוען...</p>}>
      <Shell params={params}>{children}</Shell>
    </Suspense>
  );
}
