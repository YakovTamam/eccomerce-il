import { requireStoreAccess } from "@/lib/auth/access";
import { listCategories } from "@/lib/catalog/service";
import { ProductForm } from "@/components/dashboard/product-form";

export const metadata = { title: "מוצר חדש | איקומרס.ישראל" };

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const categories = await listCategories(storeId);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">מוצר חדש</h1>
      <ProductForm
        storeId={storeId}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </main>
  );
}
