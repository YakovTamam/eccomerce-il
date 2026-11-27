"use client";

import { useActionState } from "react";
import {
  addToCartAction,
  type CartState,
} from "@/app/%5Fstore/[tenant]/cart/actions";
import { formatAgorot } from "@/lib/catalog/money";

type V = { id: string; title: string; priceAgorot: number; inStock: boolean };

export function AddToCart({ variants }: { variants: V[] }) {
  const [state, action, pending] = useActionState<CartState, FormData>(
    addToCartAction,
    {},
  );
  const firstAvailable = variants.find((v) => v.inStock)?.id;
  if (!firstAvailable)
    return (
      <p role="status" className="font-semibold">
        המוצר אזל מהמלאי
      </p>
    );
  return (
    <form action={action} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xl font-semibold">בחירת אפשרות</legend>
        {variants.map((v) => (
          <label
            key={v.id}
            className="flex items-center gap-3 rounded-[var(--radius)] border border-neutral-500 p-3"
          >
            <input
              type="radio"
              name="variantId"
              value={v.id}
              defaultChecked={v.id === firstAvailable}
              disabled={!v.inStock}
              required
            />
            <span className="flex-1">{v.title}</span>
            <strong>{formatAgorot(v.priceAgorot)}</strong>
            {!v.inStock && <span className="text-neutral-700">(אזל)</span>}
          </label>
        ))}
      </fieldset>
      <label className="flex w-32 flex-col gap-1">
        כמות
        <input
          type="number"
          name="qty"
          min={1}
          max={99}
          defaultValue={1}
          required
          className="rounded-md border border-neutral-500 px-3 py-2"
        />
      </label>
      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
        {state.error}
      </p>
      <button
        disabled={pending}
        className="self-start rounded-[var(--radius)] bg-[var(--brand)] px-6 py-3 font-semibold text-[var(--on-brand)] disabled:opacity-60"
      >
        {pending ? "מוסיף..." : "הוספה לעגלה"}
      </button>
    </form>
  );
}
