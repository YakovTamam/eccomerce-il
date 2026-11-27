"use client";

import { useEffect, useState } from "react";

function remaining(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

/** Visual countdown only; screen readers get a static end date (no per-second announcements). */
export function Countdown({ endsAt }: { endsAt: string }) {
  const [t, setT] = useState<ReturnType<typeof remaining> | undefined>(
    undefined,
  );
  useEffect(() => {
    const tick = () => setT(remaining(endsAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  const label = new Date(endsAt).toLocaleString("he-IL", {
    dateStyle: "long",
    timeStyle: "short",
  });
  if (t === undefined)
    return <span className="sr-only">המבצע מסתיים ב-{label}</span>;
  if (t === null) return <span>המבצע הסתיים</span>;
  return (
    <>
      <span className="sr-only">המבצע מסתיים ב-{label}</span>
      <span aria-hidden="true" dir="ltr" className="font-mono tabular-nums">
        {t.d}d {String(t.h).padStart(2, "0")}:{String(t.m).padStart(2, "0")}:
        {String(t.s).padStart(2, "0")}
      </span>
    </>
  );
}
