import Link from "next/link";
import { z } from "zod";
import { requireStoreAccess } from "@/lib/auth/access";
import { listDrafts } from "@/lib/drafts/service";

export const metadata = { title: "טיוטות | איקומרס.ישראל" };

const KIND = {
  page: "עמוד",
  discount: "קופון",
  product_update: "עדכון מוצר",
  campaign: "קמפיין",
} as const;
const STATUS = {
  pending: "ממתינה לאישור",
  approved: "אושרה",
  rejected: "נדחתה",
  expired: "פג תוקף",
} as const;

export default async function DraftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const st = z
    .enum(["pending", "approved", "rejected", "expired"])
    .catch("pending")
    .parse((await searchParams).status ?? "pending");
  const items = (await listDrafts(storeId, { status: st })).filter(
    (d) => !d.parentId,
  ); // campaign children live inside their campaign
  const base = `/stores/${storeId}/drafts`;
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">טיוטות</h1>
      <p className="text-neutral-700">
        שינויים שהוכנו על ידי Claude (או אחרים) וממתינים לאישור שלכם. שום דבר לא
        משתנה בחנות לפני אישור.
      </p>
      <nav aria-label="סינון לפי סטטוס" className="flex gap-4">
        {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => (
          <Link
            key={s}
            href={`${base}?status=${s}`}
            className={s === st ? "font-bold" : "underline"}
            aria-current={s === st ? "page" : undefined}
          >
            {STATUS[s]}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p>אין טיוטות.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((d) => (
            <li key={d.id} className="rounded-md border border-neutral-300 p-3">
              <Link
                href={`${base}/${d.id}`}
                className="font-semibold underline"
              >
                {d.title}
              </Link>{" "}
              <span className="text-neutral-700">
                · {KIND[d.kind]} · {d.createdAt.toLocaleString("he-IL")} ·{" "}
                {d.createdBy === "mcp" ? "Claude" : d.createdBy}
              </span>
              <p className="text-neutral-800">{d.summary[0]}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
