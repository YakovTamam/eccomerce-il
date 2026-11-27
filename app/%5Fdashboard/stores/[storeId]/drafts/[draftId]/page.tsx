import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStoreAccess } from "@/lib/auth/access";
import { DraftButtons } from "@/components/dashboard/draft-buttons";
import { draftPreviewUrl, getDraft } from "@/lib/drafts/service";

export const metadata = { title: "טיוטה | איקומרס.ישראל" };

const STATUS = {
  pending: "ממתינה לאישור",
  approved: "אושרה והופעלה",
  rejected: "נדחתה",
  expired: "פג תוקף",
} as const;

export default async function DraftPage({
  params,
}: {
  params: Promise<{ storeId: string; draftId: string }>;
}) {
  const { storeId, draftId } = await params;
  await requireStoreAccess(storeId);
  if (!z.string().uuid().safeParse(draftId).success) notFound();
  const d = await getDraft(storeId, draftId);
  if (!d) notFound();
  const pending = d.effectiveStatus === "pending";
  return (
    <main className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-2xl font-bold">{d.title}</h1>
      <p>
        סטטוס:{" "}
        <strong>{STATUS[d.effectiveStatus as keyof typeof STATUS]}</strong> ·
        נוצרה {d.createdAt.toLocaleString("he-IL")} על ידי{" "}
        {d.createdBy === "mcp" ? "Claude" : d.createdBy}
        {pending && <> · תקפה עד {d.expiresAt.toLocaleString("he-IL")}</>}
      </p>
      <section
        aria-labelledby="s"
        className="rounded-md border border-neutral-300 p-4"
      >
        <h2 id="s" className="mb-2 text-xl font-semibold">
          מה ישתנה
        </h2>
        <ul className="list-disc ps-6">
          {d.summary.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        {d.kind === "page" && (
          <p className="mt-3">
            <a
              className="underline"
              href={draftPreviewUrl(storeId, d.id, 3600)}
              target="_blank"
              rel="noopener noreferrer"
            >
              תצוגה מקדימה (נפתח בלשונית חדשה)
            </a>
          </p>
        )}
      </section>
      {d.children.length > 0 && (
        <section aria-labelledby="c">
          <h2 id="c" className="text-xl font-semibold">
            פעולות בחבילה
          </h2>
          <ul className="list-disc ps-6">
            {d.children.map((c) => (
              <li key={c.id}>
                {c.title} — {STATUS[c.status as keyof typeof STATUS]}
                {c.kind === "page" && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      className="underline"
                      href={draftPreviewUrl(storeId, c.id, 3600)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      תצוגה מקדימה
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {d.lastError && pending && (
        <p
          role="alert"
          className="rounded-md border border-red-700 p-3 text-red-800"
        >
          ניסיון האישור האחרון נכשל: {d.lastError}
        </p>
      )}
      {pending ? (
        <DraftButtons storeId={storeId} draftId={d.id} />
      ) : (
        d.decidedAt && <p>הוחלט ב-{d.decidedAt.toLocaleString("he-IL")}</p>
      )}
    </main>
  );
}
