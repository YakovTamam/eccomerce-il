"use client";

import { useActionState } from "react";
import {
  createPageAction,
  type PageFormState,
} from "@/app/%5Fdashboard/stores/[storeId]/page-actions";

export function CreatePageForm({
  storeId,
  suggestHome,
}: {
  storeId: string;
  suggestHome: boolean;
}) {
  const [state, action, pending] = useActionState<PageFormState, FormData>(
    createPageAction,
    {},
  );
  const input = "w-full rounded-md border border-neutral-400 px-3 py-2";
  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      <input type="hidden" name="storeId" value={storeId} />
      <label className="flex flex-col gap-1">
        שם העמוד
        <input
          name="title"
          required
          defaultValue={suggestHome ? "דף הבית" : ""}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        כתובת (באותיות לטיניות){suggestHome ? " — home = דף הבית" : ""}
        <input
          name="slug"
          required
          dir="ltr"
          defaultValue={suggestHome ? "home" : ""}
          className={input}
        />
      </label>
      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
        {state.error}
      </p>
      <button
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        יצירת עמוד
      </button>
    </form>
  );
}
