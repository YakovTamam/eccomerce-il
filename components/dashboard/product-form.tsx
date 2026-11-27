"use client";

import { useActionState, useState } from "react";
import {
  saveProductAction,
  type FormState,
} from "@/app/%5Fdashboard/stores/[storeId]/actions";

type Img = { url: string; alt: string };
type Variant = {
  id?: string;
  title: string;
  sku: string;
  size: string;
  color: string;
  price: string;
  compareAt: string;
  stockQty: string;
  trackStock: boolean;
};
export type ProductFormValues = {
  title: string;
  descriptionMd: string;
  status: "draft" | "active" | "archived";
  categoryId: string;
  images: Img[];
  variants: Variant[];
};

const emptyVariant = (): Variant => ({
  title: "",
  sku: "",
  size: "",
  color: "",
  price: "",
  compareAt: "",
  stockQty: "0",
  trackStock: true,
});

const input = "w-full rounded-md border border-neutral-400 px-3 py-2";

export function ProductForm({
  storeId,
  productId,
  initial,
  categories,
}: {
  storeId: string;
  productId?: string;
  initial?: ProductFormValues;
  categories: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveProductAction,
    {},
  );
  const [v, setV] = useState<ProductFormValues>(
    initial ?? {
      title: "",
      descriptionMd: "",
      status: "draft",
      categoryId: "",
      images: [],
      variants: [{ ...emptyVariant(), title: "ברירת מחדל" }],
    },
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const setVariant = (i: number, patch: Partial<Variant>) =>
    setV((p) => ({
      ...p,
      variants: p.variants.map((x, j) => (j === i ? { ...x, ...patch } : x)),
    }));
  const setImage = (i: number, patch: Partial<Img>) =>
    setV((p) => ({
      ...p,
      images: p.images.map((x, j) => (j === i ? { ...x, ...patch } : x)),
    }));

  async function upload(file: File) {
    setUploadError(null);
    setUploading(true);
    const fd = new FormData();
    fd.set("storeId", storeId);
    fd.set("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      setUploadError(
        res.status === 413
          ? "הקובץ גדול מדי (עד 5MB)"
          : res.status === 415
            ? "סוג קובץ לא נתמך (JPG, PNG, WEBP, GIF)"
            : "העלאת התמונה נכשלה",
      );
      return;
    }
    const { url } = (await res.json()) as { url: string };
    setV((p) => ({ ...p, images: [...p.images, { url, alt: "" }] }));
  }

  const payload = JSON.stringify({
    title: v.title,
    descriptionMd: v.descriptionMd,
    status: v.status,
    categoryId: v.categoryId || null,
    images: v.images,
    variants: v.variants.map((x) => ({
      id: x.id,
      title: x.title,
      sku: x.sku,
      options: {
        ...(x.size ? { size: x.size } : {}),
        ...(x.color ? { color: x.color } : {}),
      },
      price: x.price,
      compareAt: x.compareAt,
      stockQty: x.stockQty,
      trackStock: x.trackStock,
    })),
  });

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      <input type="hidden" name="storeId" value={storeId} />
      {productId && <input type="hidden" name="productId" value={productId} />}
      <input type="hidden" name="payload" value={payload} />

      <label className="flex flex-col gap-1">
        שם המוצר
        <input
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          required
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        תיאור
        <textarea
          value={v.descriptionMd}
          onChange={(e) => setV({ ...v, descriptionMd: e.target.value })}
          rows={4}
          className={input}
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          סטטוס
          <select
            value={v.status}
            onChange={(e) =>
              setV({
                ...v,
                status: e.target.value as ProductFormValues["status"],
              })
            }
            className={input}
          >
            <option value="draft">טיוטה</option>
            <option value="active">פעיל</option>
            <option value="archived">בארכיון</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          קטגוריה
          <select
            value={v.categoryId}
            onChange={(e) => setV({ ...v, categoryId: e.target.value })}
            className={input}
          >
            <option value="">ללא קטגוריה</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">תמונות</legend>
        {v.images.map((img, i) => (
          <div key={img.url} className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={img.alt || "תמונת מוצר ללא תיאור"}
              className="size-20 rounded-md object-cover"
            />
            <label className="flex flex-1 flex-col gap-1">
              תיאור התמונה (alt) — חובה
              <input
                value={img.alt}
                onChange={(e) => setImage(i, { alt: e.target.value })}
                required
                className={input}
              />
            </label>
            <button
              type="button"
              className="underline"
              onClick={() =>
                setV((p) => ({
                  ...p,
                  images: p.images.filter((_, j) => j !== i),
                }))
              }
            >
              הסרה
            </button>
          </div>
        ))}
        <label className="flex flex-col gap-1">
          הוספת תמונה
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading || v.images.length >= 10}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
        <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
          {uploadError}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-lg font-semibold">וריאציות, מחיר ומלאי</legend>
        {v.variants.map((x, i) => (
          <div
            key={x.id ?? i}
            className="grid gap-3 rounded-md border border-neutral-300 p-3 sm:grid-cols-3"
            role="group"
            aria-label={`וריאציה ${i + 1}`}
          >
            <label className="flex flex-col gap-1">
              שם וריאציה
              <input
                value={x.title}
                onChange={(e) => setVariant(i, { title: e.target.value })}
                required
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1">
              מק״ט
              <input
                value={x.sku}
                onChange={(e) => setVariant(i, { sku: e.target.value })}
                dir="ltr"
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1">
              מידה
              <input
                value={x.size}
                onChange={(e) => setVariant(i, { size: e.target.value })}
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1">
              צבע
              <input
                value={x.color}
                onChange={(e) => setVariant(i, { color: e.target.value })}
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1">
              מחיר (₪, כולל מע״מ)
              <input
                value={x.price}
                onChange={(e) => setVariant(i, { price: e.target.value })}
                inputMode="decimal"
                dir="ltr"
                required
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1">
              מחיר לפני הנחה (₪)
              <input
                value={x.compareAt}
                onChange={(e) => setVariant(i, { compareAt: e.target.value })}
                inputMode="decimal"
                dir="ltr"
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1">
              מלאי
              <input
                value={x.stockQty}
                onChange={(e) => setVariant(i, { stockQty: e.target.value })}
                inputMode="numeric"
                dir="ltr"
                required
                className={input}
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={x.trackStock}
                onChange={(e) =>
                  setVariant(i, { trackStock: e.target.checked })
                }
              />
              מעקב מלאי
            </label>
            {v.variants.length > 1 && (
              <button
                type="button"
                className="justify-self-start underline"
                onClick={() =>
                  setV((p) => ({
                    ...p,
                    variants: p.variants.filter((_, j) => j !== i),
                  }))
                }
              >
                הסרת וריאציה
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="justify-self-start rounded-md border border-black px-3 py-1"
          onClick={() =>
            setV((p) => ({ ...p, variants: [...p.variants, emptyVariant()] }))
          }
        >
          הוספת וריאציה
        </button>
      </fieldset>

      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
        {state.error}
      </p>
      <button
        disabled={pending || uploading}
        className="self-start rounded-md bg-black px-6 py-2 text-white disabled:opacity-60"
      >
        {pending ? "שומר..." : "שמירה"}
      </button>
    </form>
  );
}
