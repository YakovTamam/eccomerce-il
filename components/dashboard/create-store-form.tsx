"use client";

import { useActionState } from "react";
import {
  createStoreAction,
  type CreateStoreState,
} from "@/app/%5Fdashboard/actions";

export function CreateStoreForm({ rootHost }: { rootHost: string }) {
  const [state, action, pending] = useActionState<CreateStoreState, FormData>(
    createStoreAction,
    {},
  );
  const field = "w-full rounded-md border border-neutral-400 px-3 py-2";
  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1">
        שם העסק
        <input name="name" required className={field} />
      </label>
      <label className="flex flex-col gap-1">
        כתובת החנות
        <span className="flex items-center gap-2" dir="ltr">
          <input
            name="slug"
            required
            dir="ltr"
            className={field}
            aria-describedby="slug-hint"
          />
          <span>.{rootHost}</span>
        </span>
        <span id="slug-hint" className="text-sm text-neutral-600">
          אותיות לטיניות קטנות, ספרות ומקף
        </span>
      </label>
      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
        {state.error}
      </p>
      <button
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {pending ? "יוצר..." : "יצירת חנות"}
      </button>
    </form>
  );
}
