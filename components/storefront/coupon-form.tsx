"use client";

import { useActionState } from "react";
import {
  applyCouponAction,
  type CartState,
} from "@/app/%5Fstore/[tenant]/cart/actions";

export function CouponForm() {
  const [state, action, pending] = useActionState<CartState, FormData>(
    applyCouponAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        קוד קופון
        <span className="flex gap-2">
          <input
            name="code"
            dir="ltr"
            autoComplete="off"
            className="w-full rounded-md border border-neutral-500 px-3 py-2"
          />
          <button
            disabled={pending}
            className="rounded-[var(--radius)] border border-neutral-900 px-4 py-2"
          >
            החלה
          </button>
        </span>
      </label>
      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
        {state.error}
      </p>
    </form>
  );
}
