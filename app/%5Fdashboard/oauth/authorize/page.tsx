import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsentForm } from "@/components/dashboard/consent-form";
import { getSession } from "@/lib/auth/session";
import { callbackUrl, checkAuthorizeRequest } from "@/lib/oauth/authorize";
import { listStoresForUser } from "@/lib/tenancy/stores";

export const metadata: Metadata = {
  title: "חיבור אפליקציה | איקומרס.ישראל",
  robots: { index: false },
};

type SP = Promise<Record<string, string | string[] | undefined>>;

async function Consent({ searchParams }: { searchParams: SP }) {
  const raw = await searchParams;
  const p = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as Record<string, string | undefined>;

  const check = await checkAuthorizeRequest(p);
  if (!check.ok && check.kind === "fatal") {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="mb-3 text-2xl font-bold">לא ניתן להמשיך</h1>
        <p role="alert">{check.message}</p>
      </main>
    );
  }
  // Errors with a verified redirect_uri go back to the client (RFC 6749 §4.1.2.1).
  if (!check.ok)
    redirect(
      callbackUrl(check.redirectUri, {
        error: check.error,
        state: check.state,
      }),
    );

  const session = await getSession();
  if (!session) {
    const qs = new URLSearchParams(
      Object.entries(p).filter(
        (e): e is [string, string] => e[1] !== undefined,
      ),
    ).toString();
    redirect(`/sign-in?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
  }
  const stores = await listStoresForUser(session.user.id);
  let host = "";
  try {
    host = new URL(check.redirectUri).host;
  } catch {}

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold">
        לאשר ל-<span dir="auto">{check.clientName}</span> גישה לחנות שלך?
      </h1>
      <p>
        מחובר/ת בתור <strong>{session.user.name}</strong>. האפליקציה תוכל לפעול
        בשמך בחנות שתבחרו, בהתאם להרשאות שתאשרו. אפשר לבטל את החיבור בכל עת
        בדשבורד.
      </p>
      <p className="text-neutral-700">
        כתובת חזרה: <span dir="ltr">{host}</span>
      </p>
      {stores.length === 0 ? (
        <p role="alert">עדיין אין לך חנות. צרו חנות בדשבורד ואז חזרו לחבר.</p>
      ) : (
        <ConsentForm
          params={{
            client_id: p.client_id,
            redirect_uri: p.redirect_uri,
            response_type: p.response_type,
            code_challenge: p.code_challenge,
            code_challenge_method: p.code_challenge_method,
            scope: p.scope,
            state: p.state,
            resource: p.resource,
          }}
          stores={stores.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
          wantsWrite={check.scopes.includes("write")}
        />
      )}
    </main>
  );
}

export default function AuthorizePage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<p className="p-6">טוען...</p>}>
      <Consent searchParams={searchParams} />
    </Suspense>
  );
}
