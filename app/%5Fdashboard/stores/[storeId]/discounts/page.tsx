import { requireStoreAccess } from "@/lib/auth/access";
import { formatAgorot } from "@/lib/catalog/money";
import { listDiscounts } from "@/lib/discounts/service";
import { DiscountForm } from "@/components/dashboard/commerce-forms";
import { toggleDiscountAction } from "../commerce-actions";

export const metadata = { title: "קופונים | איקומרס.ישראל" };

export default async function DiscountsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const items = await listDiscounts(storeId);
  const label = (d: (typeof items)[number]) =>
    d.type === "percent"
      ? `${d.value}%`
      : d.type === "fixed"
        ? formatAgorot(d.value)
        : "משלוח חינם";
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">קופונים והנחות</h1>
      {items.length === 0 ? (
        <p>אין עדיין קופונים.</p>
      ) : (
        <table className="w-full">
          <caption className="sr-only">רשימת קופונים</caption>
          <thead>
            <tr>
              {["קוד", "הנחה", "שימושים", "סטטוס", ""].map((h, i) => (
                <th key={i} scope="col" className="p-2 text-start">
                  {h || <span className="sr-only">פעולות</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className="border-t border-neutral-200">
                <td className="p-2" dir="ltr">
                  {d.code}
                </td>
                <td className="p-2">{label(d)}</td>
                <td className="p-2">
                  {d.usedCount}
                  {d.usageLimit !== null ? ` / ${d.usageLimit}` : ""}
                </td>
                <td className="p-2">
                  {d.status === "active" ? "פעיל" : "מושבת"}
                </td>
                <td className="p-2">
                  <form action={toggleDiscountAction}>
                    <input type="hidden" name="storeId" value={storeId} />
                    <input type="hidden" name="id" value={d.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={d.status === "active" ? "disabled" : "active"}
                    />
                    <button className="underline">
                      {d.status === "active" ? "השבתה" : "הפעלה"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <section aria-labelledby="nd" className="flex flex-col gap-3">
        <h2 id="nd" className="text-xl font-semibold">
          קופון חדש
        </h2>
        <DiscountForm storeId={storeId} />
      </section>
    </main>
  );
}
