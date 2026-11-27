import Link from "next/link";
import { z } from "zod";
import { requireStoreAccess } from "@/lib/auth/access";
import { formatAgorot } from "@/lib/catalog/money";
import { listOrders } from "@/lib/orders/service";
import { ORDER_STATUSES, STATUS_LABELS } from "@/lib/orders/status";

export const metadata = { title: "הזמנות | איקומרס.ישראל" };

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const status = z.enum(ORDER_STATUSES).safeParse((await searchParams).status);
  const items = await listOrders(storeId, {
    status: status.success ? status.data : undefined,
  });
  const base = `/stores/${storeId}/orders`;
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">הזמנות</h1>
      <nav aria-label="סינון לפי סטטוס" className="flex flex-wrap gap-3">
        <Link
          href={base}
          className={status.success ? "underline" : "font-bold"}
          aria-current={status.success ? undefined : "page"}
        >
          הכול
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={`${base}?status=${s}`}
            className={
              status.success && status.data === s ? "font-bold" : "underline"
            }
            aria-current={
              status.success && status.data === s ? "page" : undefined
            }
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p>אין הזמנות.</p>
      ) : (
        <table className="w-full">
          <caption className="sr-only">רשימת הזמנות</caption>
          <thead>
            <tr>
              {["מספר", "תאריך", "לקוח", "סטטוס", "ערוץ", "סכום"].map((h) => (
                <th key={h} scope="col" className="p-2 text-start">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} className="border-t border-neutral-200">
                <td className="p-2">
                  <Link className="underline" href={`${base}/${o.id}`}>
                    #{o.number}
                  </Link>
                </td>
                <td className="p-2">{o.createdAt.toLocaleString("he-IL")}</td>
                <td className="p-2">{o.customerName ?? "—"}</td>
                <td className="p-2">{STATUS_LABELS[o.status]}</td>
                <td className="p-2">{o.channel}</td>
                <td className="p-2">{formatAgorot(o.totalAgorot)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
