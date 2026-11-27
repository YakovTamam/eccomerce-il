"use client";

import { useActionState } from "react";
import {
  createDiscountAction,
  refundOrderAction,
  saveShippingAction,
  setOrderStatusAction,
  type CState,
} from "@/app/%5Fdashboard/stores/[storeId]/commerce-actions";
import { agorotToInput } from "@/lib/catalog/money";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import type { ShippingSettings } from "@/lib/shipping/settings";

const input = "w-full rounded-md border border-neutral-400 px-3 py-2";
const Msg = ({ s }: { s: CState }) => (
  <p
    role="alert"
    aria-live="polite"
    className={`min-h-6 ${s.error ? "text-red-700" : "text-green-800"}`}
  >
    {s.error ?? s.ok}
  </p>
);

export function DiscountForm({ storeId }: { storeId: string }) {
  const [state, action, pending] = useActionState<CState, FormData>(
    createDiscountAction,
    {},
  );
  return (
    <form action={action} className="grid max-w-xl gap-3 sm:grid-cols-2">
      <input type="hidden" name="storeId" value={storeId} />
      <label className="flex flex-col gap-1">
        קוד
        <input name="code" required dir="ltr" className={input} />
      </label>
      <label className="flex flex-col gap-1">
        סוג
        <select name="type" className={input} defaultValue="percent">
          <option value="percent">אחוז הנחה</option>
          <option value="fixed">סכום קבוע (₪)</option>
          <option value="free_shipping">משלוח חינם</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        ערך (אחוז או ₪; לא נדרש למשלוח חינם)
        <input name="value" dir="ltr" inputMode="decimal" className={input} />
      </label>
      <label className="flex flex-col gap-1">
        מגבלת שימושים (אופציונלי)
        <input name="usageLimit" type="number" min={1} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        תחילה (אופציונלי)
        <input
          name="startsAt"
          type="datetime-local"
          dir="ltr"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        סיום (אופציונלי)
        <input
          name="endsAt"
          type="datetime-local"
          dir="ltr"
          className={input}
        />
      </label>
      <div className="sm:col-span-2">
        <Msg s={state} />
        <button
          disabled={pending}
          className="rounded-md bg-black px-6 py-2 text-white disabled:opacity-60"
        >
          יצירת קופון
        </button>
      </div>
    </form>
  );
}

export function ShippingForm({
  storeId,
  s,
}: {
  storeId: string;
  s: ShippingSettings;
}) {
  const [state, action, pending] = useActionState<CState, FormData>(
    saveShippingAction,
    {},
  );
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <input type="hidden" name="storeId" value={storeId} />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="pickupEnabled"
          defaultChecked={s.pickupEnabled}
        />
        איסוף עצמי
      </label>
      <label className="flex flex-col gap-1">
        כתובת האיסוף
        <input
          name="pickupAddress"
          defaultValue={s.pickupAddress}
          className={input}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="deliveryEnabled"
          defaultChecked={s.deliveryEnabled}
        />
        משלוח בתעריף קבוע
      </label>
      <label className="flex flex-col gap-1">
        תעריף משלוח (₪, כולל מע״מ)
        <input
          name="flatRate"
          defaultValue={agorotToInput(s.flatRateAgorot)}
          dir="ltr"
          inputMode="decimal"
          required
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        משלוח חינם מעל (₪) — ריק = לעולם לא
        <input
          name="freeOver"
          defaultValue={
            s.freeOverAgorot === null ? "" : agorotToInput(s.freeOverAgorot)
          }
          dir="ltr"
          inputMode="decimal"
          className={input}
        />
      </label>
      <Msg s={state} />
      <button
        disabled={pending}
        className="self-start rounded-md bg-black px-6 py-2 text-white disabled:opacity-60"
      >
        שמירה
      </button>
    </form>
  );
}

export function OrderActions({
  storeId,
  orderId,
  targets,
  canRefund,
}: {
  storeId: string;
  orderId: string;
  targets: OrderStatus[];
  canRefund: boolean;
}) {
  const [st, sAction, sPending] = useActionState<CState, FormData>(
    setOrderStatusAction,
    {},
  );
  const [rf, rAction, rPending] = useActionState<CState, FormData>(
    refundOrderAction,
    {},
  );
  return (
    <div className="flex flex-col gap-4">
      {targets.length > 0 && (
        <form action={sAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="orderId" value={orderId} />
          <label className="flex flex-col gap-1">
            שינוי סטטוס
            <select name="status" className={input}>
              {targets.map((t) => (
                <option key={t} value={t}>
                  {STATUS_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={sPending}
            className="rounded-md border border-black px-4 py-2 disabled:opacity-60"
          >
            עדכון
          </button>
        </form>
      )}
      {canRefund && (
        <form action={rAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="orderId" value={orderId} />
          <button
            disabled={rPending}
            className="rounded-md border border-red-700 px-4 py-2 text-red-800 disabled:opacity-60"
          >
            החזר כספי מלא
          </button>
        </form>
      )}
      <Msg s={st} />
      <Msg s={rf} />
    </div>
  );
}
