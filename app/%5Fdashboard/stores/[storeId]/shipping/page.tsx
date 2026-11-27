import { eq } from "drizzle-orm";
import { requireStoreAccess } from "@/lib/auth/access";
import { stores } from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import { readShipping } from "@/lib/shipping/settings";
import { ShippingForm } from "@/components/dashboard/commerce-forms";

export const metadata = { title: "משלוח | איקומרס.ישראל" };

export default async function ShippingPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const [s] = await withStore(storeId, (tx) =>
    tx.select().from(stores).where(eq(stores.id, storeId)),
  );
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">משלוח ואיסוף</h1>
      <ShippingForm storeId={storeId} s={readShipping(s?.settings)} />
    </main>
  );
}
