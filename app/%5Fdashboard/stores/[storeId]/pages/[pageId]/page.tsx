import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStoreAccess } from "@/lib/auth/access";
import {
  PageEditor,
  type PageEditorValues,
} from "@/components/dashboard/page-editor";
import { listCategories, listProducts } from "@/lib/catalog/service";
import { getPage, parseStoredBlocks } from "@/lib/pages/service";
import { signPreviewToken } from "@/lib/preview/token";
import {
  publishVersionAction,
  restoreVersionAction,
  unpublishAction,
} from "../../page-actions";

export const metadata = { title: "עריכת עמוד | איקומרס.ישראל" };

// Stored blocks → editing model (nullable groups become empty strings for inputs).
function toEditing(
  blocks: ReturnType<typeof parseStoredBlocks>,
): PageEditorValues["blocks"] {
  return blocks.map((b) => {
    if (b.type === "hero")
      return { ...b, cta: b.cta ?? { label: "", href: "" } };
    if (b.type === "banner")
      return {
        ...b,
        cta: b.cta ?? { label: "", href: "" },
        endsAt: b.endsAt ? b.endsAt.slice(0, 16) : "",
      };
    if (b.type === "contact")
      return { ...b, phone: b.phone ?? "", email: b.email ?? "" };
    return b;
  });
}

export default async function EditPage({
  params,
}: {
  params: Promise<{ storeId: string; pageId: string }>;
}) {
  const { storeId, pageId } = await params;
  await requireStoreAccess(storeId);
  if (!z.string().uuid().safeParse(pageId).success) notFound();
  const [page, products, categories] = await Promise.all([
    getPage(storeId, pageId),
    listProducts(storeId),
    listCategories(storeId),
  ]);
  if (!page) notFound();

  const previewToken = signPreviewToken(
    { storeId, kind: "page", id: pageId },
    3600,
  );
  const initial: PageEditorValues = {
    title: page.title,
    seoTitle: page.seo.title ?? "",
    seoDescription: page.seo.description ?? "",
    blocks: toEditing(parseStoredBlocks(page.blocks)),
  };

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {page.title}{" "}
          <span className="text-base font-normal">
            ({page.status === "published" ? "מפורסם" : "טיוטה"})
          </span>
        </h1>
        <div className="flex flex-wrap gap-4">
          <a
            className="underline"
            href={`/preview/${pageId}?t=${previewToken}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            תצוגה מקדימה (נפתח בלשונית חדשה)
          </a>
          {page.status === "published" && (
            <form action={unpublishAction}>
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="pageId" value={pageId} />
              <button className="underline">הסרה מפרסום</button>
            </form>
          )}
        </div>
      </div>

      <PageEditor
        ctx={{
          storeId,
          products: products.map((p) => ({ id: p.id, title: p.title })),
          categories: categories.map((c) => ({ id: c.id, name: c.name })),
        }}
        pageId={pageId}
        initial={initial}
      />

      <section aria-labelledby="vh" className="flex max-w-3xl flex-col gap-3">
        <h2 id="vh" className="text-xl font-semibold">
          היסטוריית גרסאות
        </h2>
        {page.versions.length === 0 ? (
          <p>עוד לא נשמרו גרסאות.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {page.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-4">
                <time dateTime={v.createdAt.toISOString()}>
                  {v.createdAt.toLocaleString("he-IL")}
                </time>
                {page.publishedVersionId === v.id && (
                  <strong>מפורסמת כרגע</strong>
                )}
                <form action={publishVersionAction}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="pageId" value={pageId} />
                  <input type="hidden" name="versionId" value={v.id} />
                  <button className="underline">פרסום גרסה זו</button>
                </form>
                <form action={restoreVersionAction}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="pageId" value={pageId} />
                  <input type="hidden" name="versionId" value={v.id} />
                  <input type="hidden" name="title" value={page.title} />
                  <button className="underline">טעינה לעורך</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
