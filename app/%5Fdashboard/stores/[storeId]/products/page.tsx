import { requireStoreAccess } from "@/lib/auth/access";
import { formatAgorot } from "@/lib/catalog/money";
import { listProducts } from "@/lib/catalog/service";

export const metadata = { title: "מוצרים | איקומרס.ישראל" };

const STATUS = { draft: "טיוטה", active: "פעיל", archived: "בארכיון" } as const;

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const items = await listProducts(storeId);
  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">מוצרים</h1>
        <a
          href={`/stores/${storeId}/products/new`}
          className="rounded-md bg-black px-4 py-2 text-white"
        >
          מוצר חדש
        </a>
      </div>
      {items.length === 0 ? (
        <p>אין עדיין מוצרים.</p>
      ) : (
        <table className="w-full text-start">
          <caption className="sr-only">רשימת מוצרים</caption>
          <thead>
            <tr className="border-b border-neutral-300 text-start">
              <th scope="col" className="p-2 text-start">
                מוצר
              </th>
              <th scope="col" className="p-2 text-start">
                סטטוס
              </th>
              <th scope="col" className="p-2 text-start">
                קטגוריה
              </th>
              <th scope="col" className="p-2 text-start">
                וריאציות
              </th>
              <th scope="col" className="p-2 text-start">
                החל מ-
              </th>
              <th scope="col" className="p-2 text-start">
                מלאי
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-neutral-200">
                <td className="p-2">
                  <a
                    className="underline"
                    href={`/stores/${storeId}/products/${p.id}`}
                  >
                    {p.title}
                  </a>
                </td>
                <td className="p-2">{STATUS[p.status]}</td>
                <td className="p-2">{p.categoryName ?? "—"}</td>
                <td className="p-2">{p.variantCount}</td>
                <td className="p-2">{formatAgorot(p.minPriceAgorot)}</td>
                <td className="p-2">{p.totalStock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
