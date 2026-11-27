import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStoreAccess } from "@/lib/auth/access";
import { formatAgorot } from "@/lib/catalog/money";
import { vatIncluded } from "@/lib/cart/pricing";
import { getOrder } from "@/lib/orders/service";
import { manualTargets, STATUS_LABELS } from "@/lib/orders/status";
import { OrderActions } from "@/components/dashboard/commerce-forms";

export const metadata = { title: "הזמנה | איקומרס.ישראל" };

export default async function OrderPage({
  params,
}: {
  params: Promise<{ storeId: string; orderId: string }>;
}) {
  const { storeId, orderId } = await params;
  await requireStoreAccess(storeId);
  if (!z.string().uuid().safeParse(orderId).success) notFound();
  const o = await getOrder(storeId, orderId);
  if (!o) notFound();
  const canRefund =
    ["paid", "preparing", "ready", "shipped", "completed"].includes(o.status) &&
    o.payments.some((p) => p.status === "paid");
  const addr = o.shippingAddress;
  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-bold">
        הזמנה #{o.number}{" "}
        <span className="text-base font-normal">
          ({STATUS_LABELS[o.status]})
        </span>
      </h1>
      <section aria-labelledby="c" className="flex flex-col gap-1">
        <h2 id="c" className="text-xl font-semibold">
          לקוח
        </h2>
        <p>{o.customer?.name}</p>
        <p dir="ltr" className="text-start">
          {o.customer?.phoneE164}
        </p>
        {o.customer?.email && (
          <p dir="ltr" className="text-start">
            {o.customer.email}
          </p>
        )}
        <p>
          {o.shippingMethod === "pickup"
            ? "איסוף עצמי"
            : `משלוח: ${addr?.street}, ${addr?.city}${addr?.zip ? ` ${addr.zip}` : ""}${addr?.notes ? ` (${addr.notes})` : ""}`}
        </p>
        {o.notes && <p className="whitespace-pre-line">הערות: {o.notes}</p>}
      </section>
      <section aria-labelledby="i">
        <h2 id="i" className="text-xl font-semibold">
          פריטים
        </h2>
        <ul>
          {o.items.map((i) => (
            <li key={i.id}>
              {i.titleSnapshot} × {i.qty} —{" "}
              {formatAgorot(i.unitPriceAgorot * i.qty)}
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex max-w-xs flex-col gap-1">
          <div className="flex justify-between">
            <dt>ביניים</dt>
            <dd>{formatAgorot(o.subtotalAgorot)}</dd>
          </div>
          {o.discountAgorot > 0 && (
            <div className="flex justify-between">
              <dt>הנחה{o.discountCode ? ` (${o.discountCode})` : ""}</dt>
              <dd>-{formatAgorot(o.discountAgorot)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>משלוח</dt>
            <dd>{formatAgorot(o.shippingAgorot)}</dd>
          </div>
          <div className="flex justify-between font-bold">
            <dt>סה״כ</dt>
            <dd>{formatAgorot(o.totalAgorot)}</dd>
          </div>
          <div className="flex justify-between text-neutral-700">
            <dt>מתוכם מע״מ</dt>
            <dd>{formatAgorot(vatIncluded(o.totalAgorot, o.vatRateBp))}</dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="p">
        <h2 id="p" className="text-xl font-semibold">
          תשלום וחשבונית
        </h2>
        {o.payments.map((p) => (
          <p key={p.id}>
            {p.provider} · {p.status} · {formatAgorot(p.amountAgorot)}
          </p>
        ))}
        {o.paidAt && <p>שולם ב-{o.paidAt.toLocaleString("he-IL")}</p>}
        {o.invoice ? (
          <p>
            חשבונית{" "}
            <a
              className="underline"
              href={o.invoice.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {o.invoice.providerDocId}
            </a>
          </p>
        ) : (
          o.status !== "pending_payment" && <p>החשבונית בהפקה...</p>
        )}
      </section>
      <OrderActions
        storeId={storeId}
        orderId={orderId}
        targets={manualTargets(o.status)}
        canRefund={canRefund}
      />
    </main>
  );
}
