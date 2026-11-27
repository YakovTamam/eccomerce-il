import { requireStoreAccess } from "@/lib/auth/access";
import { listCategories } from "@/lib/catalog/service";
import { CategoryForm } from "@/components/dashboard/category-form";
import { deleteCategoryAction } from "../actions";

export const metadata = { title: "קטגוריות | איקומרס.ישראל" };

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const cats = await listCategories(storeId);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">קטגוריות</h1>
      {cats.length === 0 ? (
        <p>אין עדיין קטגוריות.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cats.map((c) => (
            <li key={c.id} className="flex items-center gap-4">
              <span>{c.name}</span>
              <form action={deleteCategoryAction}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="categoryId" value={c.id} />
                <button
                  className="underline"
                  aria-label={`מחיקת הקטגוריה ${c.name}`}
                >
                  מחיקה
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <CategoryForm storeId={storeId} />
    </main>
  );
}
