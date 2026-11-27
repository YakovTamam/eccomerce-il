import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { stores } from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import { findStoreIdByKey } from "@/lib/tenancy/stores";

async function StoreHome({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const storeId = await findStoreIdByKey(decodeURIComponent(tenant));
  if (!storeId) notFound();
  const [store] = await withStore(storeId, (tx) =>
    tx.select().from(stores).where(eq(stores.id, storeId)),
  );
  if (!store) notFound();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-3xl font-bold">{store.name}</h1>
      <p className="text-neutral-600">החנות בבנייה</p>
    </main>
  );
}

export default function StorePage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8">טוען...</p>}>
      <StoreHome params={params} />
    </Suspense>
  );
}
