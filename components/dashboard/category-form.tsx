"use client";

import { useActionState } from "react";
import {
  createCategoryAction,
  type FormState,
} from "@/app/%5Fdashboard/stores/[storeId]/actions";

export function CategoryForm({ storeId }: { storeId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createCategoryAction,
    {},
  );
  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      <input type="hidden" name="storeId" value={storeId} />
      <label className="flex flex-col gap-1">
        שם קטגוריה חדשה
        <input
          name="name"
          required
          className="w-full rounded-md border border-neutral-400 px-3 py-2"
        />
      </label>
      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
        {state.error}
      </p>
      <button
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        הוספה
      </button>
    </form>
  );
}
