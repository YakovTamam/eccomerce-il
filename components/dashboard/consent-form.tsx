"use client";

import { useActionState } from "react";
import {
  consentAction,
  type ConsentState,
} from "@/app/%5Fdashboard/oauth/authorize/actions";

type Props = {
  params: Record<string, string | undefined>;
  stores: { id: string; name: string; slug: string }[];
  wantsWrite: boolean;
};

export function ConsentForm({ params, stores, wantsWrite }: Props) {
  const [state, action, pending] = useActionState<ConsentState, FormData>(
    consentAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-5">
      {Object.entries(params).map(([k, v]) =>
        v === undefined ? null : (
          <input key={k} type="hidden" name={k} value={v} />
        ),
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-lg font-semibold">לאיזו חנות לתת גישה?</legend>
        {stores.map((s, i) => (
          <label
            key={s.id}
            className="flex items-center gap-2 rounded-md border border-neutral-400 p-3"
          >
            <input
              type="radio"
              name="storeId"
              value={s.id}
              defaultChecked={i === 0}
              required
            />
            <span>{s.name}</span>
            <span dir="ltr" className="text-neutral-700">
              ({s.slug})
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-lg font-semibold">הרשאות</legend>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked disabled className="mt-1" />
          <span>
            <strong>קריאה</strong> — מוצרים, הזמנות, דוחות מכירות, עמודים
            וקופונים
          </span>
        </label>
        {wantsWrite && (
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="scope_write"
              defaultChecked
              className="mt-1"
            />
            <span>
              <strong>כתיבה</strong> — הכנת טיוטות לעמודים, מחירים, מוצרים
              וקופונים, ועדכון סטטוס הזמנות. שינויים משמעותיים נכנסים לתוקף רק
              אחרי אישור, וכל פעולה נרשמת ביומן.
            </span>
          </label>
        )}
      </fieldset>

      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
        {state.error}
      </p>
      <div className="flex gap-3">
        <button
          name="decision"
          value="approve"
          disabled={pending}
          className="rounded-md bg-black px-6 py-2 text-white disabled:opacity-60"
        >
          אישור וחיבור
        </button>
        <button
          name="decision"
          value="deny"
          formNoValidate
          disabled={pending}
          className="rounded-md border border-black px-6 py-2 disabled:opacity-60"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
