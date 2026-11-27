import { requireStoreAccess } from "@/lib/auth/access";
import { listPages } from "@/lib/pages/service";
import { CreatePageForm } from "@/components/dashboard/create-page-form";

export const metadata = { title: "עמודים | איקומרס.ישראל" };

export default async function PagesList({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const items = await listPages(storeId);
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">עמודים</h1>
      {items.length === 0 ? (
        <p>אין עדיין עמודים. צרו את דף הבית:</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3">
              <a
                className="underline"
                href={`/stores/${storeId}/pages/${p.id}`}
              >
                {p.title}
              </a>
              <span dir="ltr" className="text-neutral-700">
                /{p.slug === "home" ? "" : `pages/${p.slug}`}
              </span>
              <span>{p.status === "published" ? "מפורסם" : "טיוטה"}</span>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="np" className="flex flex-col gap-3">
        <h2 id="np" className="text-xl font-semibold">
          עמוד חדש
        </h2>
        <CreatePageForm
          storeId={storeId}
          suggestHome={!items.some((p) => p.slug === "home")}
        />
      </section>
    </main>
  );
}
