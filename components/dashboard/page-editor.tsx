"use client";

import { useActionState, useState } from "react";
import {
  savePageAction,
  type PageFormState,
} from "@/app/%5Fdashboard/stores/[storeId]/page-actions";
import {
  BLOCK_LABELS,
  BLOCK_TYPES,
  type BlockType,
} from "@/lib/blocks/schemas";

/* Loose editing model (all strings); normalised + validated by Zod on the server. */
type Img = { url: string; alt: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EBlock = { id: string; type: BlockType } & Record<string, any>;
type Ctx = {
  storeId: string;
  products: { id: string; title: string }[];
  categories: { id: string; name: string }[];
};

const input = "w-full rounded-md border border-neutral-400 px-3 py-2";

export function newBlock(type: BlockType): EBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "hero":
      return {
        id,
        type,
        heading: "",
        subheading: "",
        image: null,
        cta: { label: "", href: "" },
      };
    case "rich_text":
      return { id, type, markdown: "" };
    case "image":
      return { id, type, url: "", alt: "", caption: "" };
    case "gallery":
      return { id, type, images: [] };
    case "product_grid":
      return { id, type, heading: "", source: { by: "all" }, limit: 8 };
    case "featured_product":
      return { id, type, productId: "" };
    case "banner":
      return { id, type, text: "", cta: { label: "", href: "" }, endsAt: "" };
    case "testimonials":
      return { id, type, items: [{ quote: "", author: "" }] };
    case "faq":
      return { id, type, items: [{ question: "", answer: "" }] };
    case "cta_whatsapp":
      return { id, type, label: "להזמנה בוואטסאפ", phone: "", message: "" };
    case "contact":
      return {
        id,
        type,
        heading: "יצירת קשר",
        phone: "",
        email: "",
        address: "",
        hours: "",
      };
    case "spacer":
      return { id, type, size: "md" };
  }
}

/** Editing model → API shape (empty optional groups become null). */
export function normalizeBlock(b: EBlock): unknown {
  const cta = (c: { label?: string; href?: string } | null | undefined) =>
    c && (c.label?.trim() || c.href?.trim())
      ? { label: c.label ?? "", href: c.href ?? "" }
      : null;
  const img = (i: Img | null | undefined) =>
    i && i.url ? { url: i.url, alt: i.alt } : null;
  const nn = (s?: string) => (s && s.trim() ? s.trim() : null);
  switch (b.type) {
    case "hero":
      return { ...b, image: img(b.image), cta: cta(b.cta) };
    case "banner":
      return {
        ...b,
        cta: cta(b.cta),
        endsAt: b.endsAt ? new Date(b.endsAt).toISOString() : null,
      };
    case "contact":
      return { ...b, phone: nn(b.phone), email: nn(b.email) };
    case "product_grid":
      return { ...b, limit: Number(b.limit) };
    default:
      return b;
  }
}

export type PageEditorValues = {
  title: string;
  seoTitle: string;
  seoDescription: string;
  blocks: EBlock[];
};

export function PageEditor({
  ctx,
  pageId,
  initial,
}: {
  ctx: Ctx;
  pageId: string;
  initial: PageEditorValues;
}) {
  const [state, action, pending] = useActionState<PageFormState, FormData>(
    savePageAction,
    {},
  );
  const [v, setV] = useState(initial);
  const [adding, setAdding] = useState<BlockType>("hero");

  const setBlock = (i: number, b: EBlock) =>
    setV((p) => ({ ...p, blocks: p.blocks.map((x, j) => (j === i ? b : x)) }));
  const move = (i: number, d: -1 | 1) =>
    setV((p) => {
      const j = i + d;
      if (j < 0 || j >= p.blocks.length) return p;
      const blocks = [...p.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...p, blocks };
    });

  const payload = JSON.stringify({
    title: v.title,
    seo: {
      title: v.seoTitle || undefined,
      description: v.seoDescription || undefined,
    },
    blocks: v.blocks.map(normalizeBlock),
  });

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      <input type="hidden" name="storeId" value={ctx.storeId} />
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="payload" value={payload} />

      <label className="flex flex-col gap-1">
        שם העמוד
        <input
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          required
          className={input}
        />
      </label>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="font-semibold">SEO</legend>
        <label className="flex flex-col gap-1">
          כותרת לגוגל (עד 70 תווים)
          <input
            value={v.seoTitle}
            maxLength={70}
            onChange={(e) => setV({ ...v, seoTitle: e.target.value })}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          תיאור לגוגל (עד 200 תווים)
          <input
            value={v.seoDescription}
            maxLength={200}
            onChange={(e) => setV({ ...v, seoDescription: e.target.value })}
            className={input}
          />
        </label>
      </fieldset>

      <section aria-label="בלוקים" className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">בלוקים</h2>
        {v.blocks.length === 0 && <p>העמוד ריק. הוסיפו בלוק ראשון.</p>}
        <ol className="flex flex-col gap-4">
          {v.blocks.map((b, i) => (
            <li key={b.id} className="rounded-md border border-neutral-400">
              <details open={v.blocks.length <= 3 || b.type !== "spacer"}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3 font-semibold">
                  <span>
                    {i + 1}. {BLOCK_LABELS[b.type]}
                  </span>
                </summary>
                <div className="flex flex-col gap-3 border-t border-neutral-300 p-3">
                  <BlockForm
                    b={b}
                    onChange={(nb) => setBlock(i, nb)}
                    ctx={ctx}
                  />
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="underline disabled:opacity-40"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`העברת בלוק ${i + 1} למעלה`}
                    >
                      ↑ למעלה
                    </button>
                    <button
                      type="button"
                      className="underline disabled:opacity-40"
                      disabled={i === v.blocks.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`העברת בלוק ${i + 1} למטה`}
                    >
                      ↓ למטה
                    </button>
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        setV((p) => ({
                          ...p,
                          blocks: p.blocks.filter((_, j) => j !== i),
                        }))
                      }
                      aria-label={`מחיקת בלוק ${i + 1}`}
                    >
                      מחיקה
                    </button>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            סוג בלוק
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value as BlockType)}
              className={input}
            >
              {BLOCK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BLOCK_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-md border border-black px-3 py-2"
            onClick={() =>
              setV((p) => ({ ...p, blocks: [...p.blocks, newBlock(adding)] }))
            }
          >
            הוספת בלוק
          </button>
        </div>
      </section>

      <p
        role="alert"
        aria-live="polite"
        className={`min-h-6 ${state.error ? "text-red-700" : "text-green-800"}`}
      >
        {state.error ?? state.ok}
      </p>
      <div className="flex gap-3">
        <button
          name="intent"
          value="save"
          disabled={pending}
          className="rounded-md border border-black px-6 py-2 disabled:opacity-60"
        >
          שמירת טיוטה
        </button>
        <button
          name="intent"
          value="publish"
          disabled={pending}
          className="rounded-md bg-black px-6 py-2 text-white disabled:opacity-60"
        >
          שמירה ופרסום
        </button>
      </div>
    </form>
  );
}

/* ───────────── field helpers ───────────── */

function Text({
  label,
  value,
  onChange,
  multiline,
  dir,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  dir?: "ltr";
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          required={required}
          className={input}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir={dir}
          required={required}
          className={input}
        />
      )}
      {hint && <span className="text-sm text-neutral-700">{hint}</span>}
    </label>
  );
}

function ImageField({
  label,
  value,
  onChange,
  storeId,
  optional,
}: {
  label: string;
  value: Img | null;
  onChange: (v: Img | null) => void;
  storeId: string;
  optional?: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    const fd = new FormData();
    fd.set("storeId", storeId);
    fd.set("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok)
      return setErr(
        res.status === 413
          ? "הקובץ גדול מדי (עד 5MB)"
          : res.status === 415
            ? "סוג קובץ לא נתמך"
            : "העלאה נכשלה",
      );
    const { url } = (await res.json()) as { url: string };
    onChange({ url, alt: value?.alt ?? "" });
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        {label}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </label>
      {value?.url && (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.url}
            alt={value.alt || "תמונה ללא תיאור"}
            className="size-16 rounded-md object-cover"
          />
          <label className="flex flex-1 flex-col gap-1">
            תיאור התמונה (alt) — חובה
            <input
              value={value.alt}
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
              required
              className={input}
            />
          </label>
          {optional && (
            <button
              type="button"
              className="underline"
              onClick={() => onChange(null)}
            >
              הסרה
            </button>
          )}
        </div>
      )}
      <p role="alert" className="text-red-700">
        {err}
      </p>
    </div>
  );
}

function Cta({
  value,
  onChange,
}: {
  value: { label: string; href: string } | null;
  onChange: (v: { label: string; href: string }) => void;
}) {
  const c = value ?? { label: "", href: "" };
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="font-semibold">כפתור (אופציונלי)</legend>
      <Text
        label="טקסט הכפתור"
        value={c.label}
        onChange={(label) => onChange({ ...c, label })}
      />
      <Text
        label="קישור (/… או https://…)"
        value={c.href}
        onChange={(href) => onChange({ ...c, href })}
        dir="ltr"
      />
    </fieldset>
  );
}

function BlockForm({
  b,
  onChange,
  ctx,
}: {
  b: EBlock;
  onChange: (b: EBlock) => void;
  ctx: Ctx;
}) {
  const set = (patch: Record<string, unknown>) => onChange({ ...b, ...patch });
  switch (b.type) {
    case "hero":
      return (
        <>
          <Text
            label="כותרת"
            value={b.heading}
            onChange={(heading) => set({ heading })}
            required
          />
          <Text
            label="תת-כותרת"
            value={b.subheading}
            onChange={(subheading) => set({ subheading })}
          />
          <ImageField
            label="תמונת רקע (אופציונלי)"
            value={b.image}
            onChange={(image) => set({ image })}
            storeId={ctx.storeId}
            optional
          />
          <Cta value={b.cta} onChange={(cta) => set({ cta })} />
        </>
      );
    case "rich_text":
      return (
        <Text
          label="טקסט (Markdown מוגבל: ## כותרת, - רשימה, **מודגש**, *נטוי*, [קישור](https://…))"
          value={b.markdown}
          onChange={(markdown) => set({ markdown })}
          multiline
        />
      );
    case "image":
      return (
        <>
          <ImageField
            label="תמונה"
            value={b.url ? { url: b.url, alt: b.alt } : null}
            onChange={(i) => set({ url: i?.url ?? "", alt: i?.alt ?? "" })}
            storeId={ctx.storeId}
          />
          <Text
            label="כיתוב (אופציונלי)"
            value={b.caption}
            onChange={(caption) => set({ caption })}
          />
        </>
      );
    case "gallery":
      return (
        <>
          {(b.images as Img[]).map((im, i) => (
            <div key={i} className="rounded-md border border-neutral-300 p-2">
              <ImageField
                label={`תמונה ${i + 1}`}
                value={im}
                onChange={(n) =>
                  set({
                    images: n
                      ? (b.images as Img[]).map((x, j) => (j === i ? n : x))
                      : (b.images as Img[]).filter((_, j) => j !== i),
                  })
                }
                storeId={ctx.storeId}
                optional
              />
            </div>
          ))}
          <ImageField
            label="הוספת תמונה לגלריה"
            value={null}
            onChange={(n) => n && set({ images: [...(b.images as Img[]), n] })}
            storeId={ctx.storeId}
          />
        </>
      );
    case "product_grid":
      return (
        <>
          <Text
            label="כותרת (אופציונלי)"
            value={b.heading}
            onChange={(heading) => set({ heading })}
          />
          <label className="flex flex-col gap-1">
            מקור המוצרים
            <select
              value={b.source.by}
              onChange={(e) =>
                set({
                  source:
                    e.target.value === "all"
                      ? { by: "all" }
                      : e.target.value === "category"
                        ? {
                            by: "category",
                            categoryId: ctx.categories[0]?.id ?? "",
                          }
                        : { by: "products", productIds: [] },
                })
              }
              className={input}
            >
              <option value="all">כל המוצרים הפעילים</option>
              <option value="category">קטגוריה</option>
              <option value="products">מוצרים נבחרים</option>
            </select>
          </label>
          {b.source.by === "category" && (
            <label className="flex flex-col gap-1">
              קטגוריה
              <select
                value={b.source.categoryId}
                onChange={(e) =>
                  set({
                    source: { by: "category", categoryId: e.target.value },
                  })
                }
                className={input}
              >
                {ctx.categories.length === 0 && (
                  <option value="">אין קטגוריות</option>
                )}
                {ctx.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {b.source.by === "products" && (
            <fieldset className="flex flex-col gap-1">
              <legend className="font-semibold">בחירת מוצרים</legend>
              {ctx.products.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(b.source.productIds as string[]).includes(p.id)}
                    onChange={(e) =>
                      set({
                        source: {
                          by: "products",
                          productIds: e.target.checked
                            ? [...b.source.productIds, p.id]
                            : (b.source.productIds as string[]).filter(
                                (x) => x !== p.id,
                              ),
                        },
                      })
                    }
                  />
                  {p.title}
                </label>
              ))}
            </fieldset>
          )}
          <label className="flex flex-col gap-1">
            כמות מקסימלית
            <input
              type="number"
              min={1}
              max={24}
              value={b.limit}
              onChange={(e) => set({ limit: e.target.value })}
              className={input}
            />
          </label>
        </>
      );
    case "featured_product":
      return (
        <label className="flex flex-col gap-1">
          מוצר
          <select
            value={b.productId}
            onChange={(e) => set({ productId: e.target.value })}
            required
            className={input}
          >
            <option value="">בחרו מוצר</option>
            {ctx.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      );
    case "banner":
      return (
        <>
          <Text
            label="טקסט המבצע"
            value={b.text}
            onChange={(text) => set({ text })}
            required
          />
          <label className="flex flex-col gap-1">
            סיום המבצע — ספירה לאחור (אופציונלי)
            <input
              type="datetime-local"
              value={b.endsAt}
              onChange={(e) => set({ endsAt: e.target.value })}
              dir="ltr"
              className={input}
            />
          </label>
          <Cta value={b.cta} onChange={(cta) => set({ cta })} />
        </>
      );
    case "testimonials":
      return (
        <>
          {(b.items as { quote: string; author: string }[]).map((it, i) => (
            <fieldset
              key={i}
              className="grid gap-2 rounded-md border border-neutral-300 p-2"
            >
              <legend>המלצה {i + 1}</legend>
              <Text
                label="ציטוט"
                value={it.quote}
                onChange={(quote) =>
                  set({
                    items: b.items.map((x: typeof it, j: number) =>
                      j === i ? { ...x, quote } : x,
                    ),
                  })
                }
                multiline
              />
              <Text
                label="שם"
                value={it.author}
                onChange={(author) =>
                  set({
                    items: b.items.map((x: typeof it, j: number) =>
                      j === i ? { ...x, author } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="justify-self-start underline"
                onClick={() =>
                  set({
                    items: b.items.filter((_: unknown, j: number) => j !== i),
                  })
                }
              >
                הסרה
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="justify-self-start underline"
            onClick={() =>
              set({ items: [...b.items, { quote: "", author: "" }] })
            }
          >
            הוספת המלצה
          </button>
        </>
      );
    case "faq":
      return (
        <>
          {(b.items as { question: string; answer: string }[]).map((it, i) => (
            <fieldset
              key={i}
              className="grid gap-2 rounded-md border border-neutral-300 p-2"
            >
              <legend>שאלה {i + 1}</legend>
              <Text
                label="שאלה"
                value={it.question}
                onChange={(question) =>
                  set({
                    items: b.items.map((x: typeof it, j: number) =>
                      j === i ? { ...x, question } : x,
                    ),
                  })
                }
              />
              <Text
                label="תשובה"
                value={it.answer}
                onChange={(answer) =>
                  set({
                    items: b.items.map((x: typeof it, j: number) =>
                      j === i ? { ...x, answer } : x,
                    ),
                  })
                }
                multiline
              />
              <button
                type="button"
                className="justify-self-start underline"
                onClick={() =>
                  set({
                    items: b.items.filter((_: unknown, j: number) => j !== i),
                  })
                }
              >
                הסרה
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="justify-self-start underline"
            onClick={() =>
              set({ items: [...b.items, { question: "", answer: "" }] })
            }
          >
            הוספת שאלה
          </button>
        </>
      );
    case "cta_whatsapp":
      return (
        <>
          <Text
            label="טקסט הכפתור"
            value={b.label}
            onChange={(label) => set({ label })}
          />
          <Text
            label="מספר וואטסאפ בפורמט בינלאומי (+972501234567)"
            value={b.phone}
            onChange={(phone) => set({ phone })}
            dir="ltr"
            required
          />
          <Text
            label="הודעה מוכנה מראש (אופציונלי)"
            value={b.message}
            onChange={(message) => set({ message })}
          />
        </>
      );
    case "contact":
      return (
        <>
          <Text
            label="כותרת"
            value={b.heading}
            onChange={(heading) => set({ heading })}
          />
          <Text
            label="טלפון"
            value={b.phone}
            onChange={(phone) => set({ phone })}
            dir="ltr"
          />
          <Text
            label="אימייל"
            value={b.email}
            onChange={(email) => set({ email })}
            dir="ltr"
          />
          <Text
            label="כתובת"
            value={b.address}
            onChange={(address) => set({ address })}
          />
          <Text
            label="שעות פעילות"
            value={b.hours}
            onChange={(hours) => set({ hours })}
          />
        </>
      );
    case "spacer":
      return (
        <label className="flex flex-col gap-1">
          גודל הרווח
          <select
            value={b.size}
            onChange={(e) => set({ size: e.target.value })}
            className={input}
          >
            <option value="sm">קטן</option>
            <option value="md">בינוני</option>
            <option value="lg">גדול</option>
          </select>
        </label>
      );
  }
}
