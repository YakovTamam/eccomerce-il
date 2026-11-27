import { eq } from "drizzle-orm";
import { requireStoreAccess } from "@/lib/auth/access";
import { stores } from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import { readTheme } from "@/lib/theme/theme";
import { DesignForm } from "@/components/dashboard/design-form";

export const metadata = { title: "עיצוב | איקומרס.ישראל" };

export default async function DesignPage({
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
      <h1 className="text-2xl font-bold">עיצוב החנות</h1>
      <DesignForm storeId={storeId} theme={readTheme(s?.settings)} />
    </main>
  );
}
