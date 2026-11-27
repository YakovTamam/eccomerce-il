"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { authClient } from "@/lib/auth/client";
import { safeNext } from "@/lib/auth/next";

const schema = z.object({
  name: z.string().trim().min(2, "נא להזין שם").optional(),
  email: z.string().trim().email("כתובת אימייל לא תקינה"),
  password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים"),
});

export function AuthForm({
  mode,
  next,
}: {
  mode: "sign-in" | "sign-up";
  next?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const isSignUp = mode === "sign-up";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      name: isSignUp ? fd.get("name") : undefined,
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setPending(true);
    const { name, email, password } = parsed.data;
    const res = isSignUp
      ? await authClient.signUp.email({ name: name ?? "", email, password })
      : await authClient.signIn.email({ email, password });
    setPending(false);
    if (res.error) {
      return setError(
        isSignUp
          ? "לא ניתן ליצור את החשבון. ייתכן שהאימייל כבר רשום."
          : "אימייל או סיסמה שגויים",
      );
    }
    router.push(safeNext(next));
    router.refresh();
  }

  const field = "w-full rounded-md border border-neutral-400 px-3 py-2";
  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-4"
      noValidate
    >
      <h1 className="text-2xl font-bold">
        {isSignUp ? "יצירת חשבון" : "התחברות"}
      </h1>
      {isSignUp && (
        <label className="flex flex-col gap-1">
          שם מלא
          <input name="name" autoComplete="name" required className={field} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        אימייל
        <input
          name="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        סיסמה
        <input
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          dir="ltr"
          required
          minLength={8}
          className={field}
        />
      </label>
      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">
        {error}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {pending ? "רגע..." : isSignUp ? "הרשמה" : "כניסה"}
      </button>
      <a
        className="underline"
        href={`${isSignUp ? "/sign-in" : "/sign-up"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
      >
        {isSignUp ? "כבר יש לי חשבון" : "אין לי חשבון עדיין"}
      </a>
    </form>
  );
}
