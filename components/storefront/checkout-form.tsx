"use client";

import { useActionState } from "react";
import {
  checkoutAction,
  type CartState,
} from "@/app/%5Fstore/[tenant]/cart/actions";

const field = "w-full rounded-md border border-neutral-500 px-3 py-2";

export function CheckoutForm({
  shippingMethod,
  pickupAddress,
}: {
  shippingMethod: "pickup" | "delivery";
  pickupAddress: string;
}) {
  const [state, action, pending] = useActionState<CartState, FormData>(
    checkoutAction,
    {},
  );
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <input type="hidden" name="shippingMethod" value={shippingMethod} />
      <label className="flex flex-col gap-1">
        שם מלא
        <input name="name" autoComplete="name" required className={field} />
      </label>
      <label className="flex flex-col gap-1">
        טלפון נייד
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          className={field}
          placeholder="050-1234567"
        />
      </label>
      <label className="flex flex-col gap-1">
        אימייל (לקבלת אישור וחשבונית)
        <input
          name="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          className={field}
        />
      </label>

      {shippingMethod === "delivery" ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="text-lg font-semibold">כתובת למשלוח</legend>
          <label className="flex flex-col gap-1">
            רחוב ומספר
            <input
              name="street"
              autoComplete="street-address"
              required
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1">
            עיר
            <input
              name="city"
              autoComplete="address-level2"
              required
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1">
            מיקוד (אופציונלי)
            <input
              name="zip"
              autoComplete="postal-code"
              dir="ltr"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1">
            הערות לשליח (אופציונלי)
            <input name="addressNotes" className={field} />
          </label>
        </fieldset>
      ) : (
        <p>איסוף עצמי{pickupAddress ? `: ${pickupAddress}` : ""}</p>
      )}

      <label className="flex flex-col gap-1">
        הערות להזמנה (אופציונלי)
        <textarea name="notes" rows={2} className={field} />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="marketingOptIn" className="mt-1" />
        <span>אני מאשר/ת קבלת עדכונים ומבצעים בהודעות (אפשר לבטל בכל עת)</span>
      </label>
      <p className="text-neutral-700">
        לחיצה על ״לתשלום״ מעבירה לדף תשלום מאובטח של חברת הסליקה. פרטי האשראי
        אינם נשמרים אצלנו.
      </p>
      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
        {state.error}
      </p>
      <button
        disabled={pending}
        className="self-start rounded-[var(--radius)] bg-[var(--brand)] px-6 py-3 font-semibold text-[var(--on-brand)] disabled:opacity-60"
      >
        {pending ? "מעביר לתשלום..." : "לתשלום"}
      </button>
    </form>
  );
}
