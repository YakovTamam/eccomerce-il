import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CreateStoreForm } from "@/components/dashboard/create-store-form";
import { getSession } from "@/lib/auth/session";
import { listStoresForUser } from "@/lib/tenancy/stores";

export const metadata = { title: "לוח בקרה | איקומרס.ישראל" };

async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const host = (await headers()).get("host") ?? "";
  const rootHost = host.replace(/^app\./, "");
  const proto = rootHost.startsWith("localhost") ? "http" : "https";
  const myStores = await listStoresForUser(session.user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-bold">שלום {session.user.name}</h1>
      <section aria-labelledby="stores-h" className="flex flex-col gap-3">
        <h2 id="stores-h" className="text-xl font-semibold">
          החנויות שלי
        </h2>
        {myStores.length === 0 ? (
          <p>עדיין אין לך חנות. צרו את הראשונה:</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {myStores.map((s) => (
              <li key={s.id}>
                <a
                  className="underline"
                  href={`${proto}://${s.slug}.${rootHost}`}
                >
                  {s.name}
                </a>{" "}
                <span className="text-neutral-600" dir="ltr">
                  ({s.slug})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="new-h" className="flex flex-col gap-3">
        <h2 id="new-h" className="text-xl font-semibold">
          חנות חדשה
        </h2>
        <CreateStoreForm rootHost={rootHost} />
      </section>
    </main>
  );
}

export default function AppHome() {
  return (
    <Suspense fallback={<p className="p-6">טוען...</p>}>
      <Dashboard />
    </Suspense>
  );
}
