"use client";

import { useActionState, useState } from "react";
import {
  saveThemeAction,
  type DesignState,
} from "@/app/%5Fdashboard/stores/[storeId]/design-actions";
import { contrastRatio, readableOn, type Theme } from "@/lib/theme/theme";

const input = "w-full rounded-md border border-neutral-400 px-3 py-2";

export function DesignForm({
  storeId,
  theme,
}: {
  storeId: string;
  theme: Theme;
}) {
  const [state, action, pending] = useActionState<DesignState, FormData>(
    saveThemeAction,
    {},
  );
  const [t, setT] = useState(theme);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setErr(null);
    const fd = new FormData();
    fd.set("storeId", storeId);
    fd.set("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    if (!res.ok) return setErr("העלאת הלוגו נכשלה");
    setT({ ...t, logoUrl: ((await res.json()) as { url: string }).url });
  }

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="logoUrl" value={t.logoUrl ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          צבע ראשי
          <input
            type="color"
            name="primaryColor"
            value={t.primaryColor}
            onChange={(e) => setT({ ...t, primaryColor: e.target.value })}
            className="h-10 w-full"
          />
        </label>
        <label className="flex flex-col gap-1">
          צבע משני
          <input
            type="color"
            name="secondaryColor"
            value={t.secondaryColor}
            onChange={(e) => setT({ ...t, secondaryColor: e.target.value })}
            className="h-10 w-full"
          />
        </label>
      </div>
      <p className="text-sm text-neutral-700">
        צבע הטקסט על גבי הצבעים נבחר אוטומטית (שחור או לבן) כדי לשמור על
        ניגודיות תקנית.
      </p>
      <div
        className="rounded-md p-4"
        style={{
          background: t.primaryColor,
          color: readableOn(t.primaryColor),
        }}
        aria-label="תצוגה מקדימה של הצבע הראשי"
      >
        כך ייראה הכותרת של החנות (ניגודיות{" "}
        {contrastRatio(t.primaryColor, readableOn(t.primaryColor)).toFixed(1)}
        :1)
      </div>
      <label className="flex flex-col gap-1">
        פונט
        <select
          name="font"
          value={t.font}
          onChange={(e) =>
            setT({ ...t, font: e.target.value as Theme["font"] })
          }
          className={input}
        >
          <option value="heebo">Heebo</option>
          <option value="assistant">Assistant</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        עיגול פינות
        <select
          name="radius"
          value={t.radius}
          onChange={(e) =>
            setT({ ...t, radius: e.target.value as Theme["radius"] })
          }
          className={input}
        >
          <option value="none">ללא</option>
          <option value="sm">קטן</option>
          <option value="md">בינוני</option>
          <option value="lg">גדול</option>
        </select>
      </label>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          לוגו
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
        {t.logoUrl && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={t.logoUrl}
              alt="הלוגו הנוכחי של החנות"
              className="h-12 w-auto"
            />
            <button
              type="button"
              className="underline"
              onClick={() => setT({ ...t, logoUrl: null })}
            >
              הסרת לוגו
            </button>
          </div>
        )}
        <p role="alert" className="text-red-700">
          {err}
        </p>
      </div>
      <p
        role="alert"
        aria-live="polite"
        className={`min-h-6 ${state.error ? "text-red-700" : "text-green-800"}`}
      >
        {state.error ?? state.ok}
      </p>
      <button
        disabled={pending}
        className="self-start rounded-md bg-black px-6 py-2 text-white disabled:opacity-60"
      >
        שמירה
      </button>
    </form>
  );
}
