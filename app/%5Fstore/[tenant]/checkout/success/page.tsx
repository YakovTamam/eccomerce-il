import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { z } from "zod";
import { formatAgorot } from "@/lib/catalog/money";
import { STATUS_LABELS } from "@/lib/orders/status";
import { getOrder } from "@/lib/orders/service";
import { currentStore } from "@/lib/storefront/tenant";

export const metadata: Metadata = {
  title: "ההזמנה התקבלה",
  robots: { index: false },
};

async function Success({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const store = await currentStore();
  const { order: id } = await searchParams;
  const orderId = z.string().uuid().safeParse(id);
  // Looked up inside this store only (RLS); the unguessable id is the capability. No personal data is shown.
  const order = orderId.success ? await getOrder(store.id, orderId.data) : null;
  if (!order) return <p>ההזמנה לא נמצאה.</p>;
  const paid =
    order.status !== "pending_payment" && order.status !== "cancelled";
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">
        {paid ? "תודה! ההזמנה התקבלה" : "ממתינים לאישור התשלום"}
      </h1>
      <p role="status">
        הזמנה <strong>#{order.number}</strong> · {STATUS_LABELS[order.status]}
      </p>
      {!paid && (
        <p>אם שילמתם זה עתה, האישור יגיע בתוך רגעים. אפשר לרענן את הדף.</p>
      )}
      <ul className="flex flex-col gap-1">
        {order.items.map((i) => (
          <li key={i.id}>
            {i.titleSnapshot} × {i.qty} —{" "}
            {formatAgorot(i.unitPriceAgorot * i.qty)}
          </li>
        ))}
      </ul>
      <p className="text-xl font-bold">
        סה״כ: {formatAgorot(order.totalAgorot)}
      </p>
      <Link href="/" className="underline">
        חזרה לחנות
      </Link>
    </section>
  );
}

export default function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  return (
    <Suspense fallback={<p>טוען...</p>}>
      <Success searchParams={searchParams} />
    </Suspense>
  );
}
