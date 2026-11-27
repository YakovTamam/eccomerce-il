"use client";

import { useActionState } from "react";
import {
  approveDraftAction,
  rejectDraftAction,
  type DraftState,
} from "@/app/%5Fdashboard/stores/[storeId]/draft-actions";

export function DraftButtons({
  storeId,
  draftId,
}: {
  storeId: string;
  draftId: string;
}) {
  const [a, approve, ap] = useActionState<DraftState, FormData>(
    approveDraftAction,
    {},
  );
  const [r, reject, rp] = useActionState<DraftState, FormData>(
    rejectDraftAction,
    {},
  );
  const fields = (
    <>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="draftId" value={draftId} />
    </>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <form action={approve}>
          {fields}
          <button
            disabled={ap || rp}
            className="rounded-md bg-black px-6 py-2 text-white disabled:opacity-60"
          >
            {ap ? "מפעיל..." : "אישור והפעלה"}
          </button>
        </form>
        <form action={reject}>
          {fields}
          <button
            disabled={ap || rp}
            className="rounded-md border border-black px-6 py-2 disabled:opacity-60"
          >
            דחייה
          </button>
        </form>
      </div>
      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
        {a.error ?? r.error}
      </p>
    </div>
  );
}
