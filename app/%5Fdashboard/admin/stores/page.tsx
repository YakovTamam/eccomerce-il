import Link from "next/link";
import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Store,
} from "lucide-react";
import { z } from "zod";
import {
  Avatar,
  Card,
  Empty,
  PageHead,
  PlanBadge,
  StatusBadge,
} from "@/components/admin/ui";
import { listStoresAdmin, type StoreSort } from "@/lib/admin/queries";
import { timeAgo } from "@/lib/admin/format";
import { formatShekelsRounded } from "@/lib/catalog/money";

export const metadata = { title: "חנויות" };

const sp = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(["active", "suspended"]).optional().catch(undefined),
  plan: z.enum(["basic", "pro", "growth"]).optional().catch(undefined),
  sort: z.enum(["created", "gmv", "orders", "name"]).catch("created"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const f = sp.parse(flat);
  const res = await listStoresAdmin({
    q: f.q || undefined,
    status: f.status,
    plan: f.plan,
    sort: f.sort,
    page: f.page,
  });

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = {
      q: f.q,
      status: f.status,
      plan: f.plan,
      sort: f.sort === "created" ? undefined : f.sort,
      page: undefined as string | undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/stores${s ? `?${s}` : ""}`;
  };
  const th = (label: string, key?: StoreSort, end?: boolean) => (
    <th
      scope="col"
      className={end ? "a-end" : undefined}
      aria-sort={key && f.sort === key ? "descending" : undefined}
    >
      {key ? (
        <Link
          href={href({ sort: key })}
          className="a-link"
          style={{ color: f.sort === key ? "var(--a-accent-text)" : "inherit" }}
        >
          {label}
          {f.sort === key && <ArrowDown size={14} aria-hidden="true" />}
        </Link>
      ) : (
        label
      )}
    </th>
  );

  return (
    <>
      <PageHead
        title="חנויות"
        description={`${res.total} חנויות${f.q ? ` תואמות ל-״${f.q}״` : ""}`}
      />

      <Card pad={false}>
        <form
          action="/admin/stores"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            padding: 16,
            borderBlockEnd: "1px solid var(--a-border)",
          }}
        >
          <div className="a-search" style={{ flex: "1 1 260px" }}>
            <Search size={18} aria-hidden="true" />
            <input
              name="q"
              type="search"
              defaultValue={f.q}
              className="a-input"
              placeholder="שם חנות, כתובת, בעלים או אימייל"
              aria-label="חיפוש"
            />
          </div>
          {f.status && <input type="hidden" name="status" value={f.status} />}
          {f.sort !== "created" && (
            <input type="hidden" name="sort" value={f.sort} />
          )}
          <label className="sr-only" htmlFor="plan">
            תוכנית
          </label>
          <select
            id="plan"
            name="plan"
            defaultValue={f.plan ?? ""}
            className="a-select"
            style={{ width: 150 }}
          >
            <option value="">כל התוכניות</option>
            <option value="basic">בסיס</option>
            <option value="pro">פרו</option>
            <option value="growth">צמיחה</option>
          </select>
          <button className="a-btn">סינון</button>
          <nav className="a-segment" aria-label="סינון לפי סטטוס">
            {[
              [undefined, "הכול"],
              ["active", "פעילות"],
              ["suspended", "מושעות"],
            ].map(([v, label]) => (
              <Link
                key={label}
                href={href({ status: v })}
                aria-current={f.status === v ? "true" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
        </form>

        {res.rows.length === 0 ? (
          <Empty
            icon={Store}
            title="לא נמצאו חנויות"
            hint="נסו לשנות את החיפוש או הסינון."
          />
        ) : (
          <div className="a-table-wrap">
            <table className="a-table">
              <caption className="sr-only">רשימת חנויות</caption>
              <thead>
                <tr>
                  {th("חנות", "name")}
                  {th("בעלים")}
                  {th("תוכנית")}
                  {th("סטטוס")}
                  {th("הזמנות (30י׳)", "orders", true)}
                  {th("מכירות (30י׳)", "gmv", true)}
                  {th("נוצרה", "created")}
                </tr>
              </thead>
              <tbody>
                {res.rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="a-cell-main">
                        <Avatar name={s.name} />
                        <span>
                          <Link
                            href={`/admin/stores/${s.id}`}
                            className="a-link"
                            style={{ color: "var(--a-text)", fontWeight: 700 }}
                          >
                            {s.name}
                          </Link>
                          <small dir="ltr" style={{ textAlign: "start" }}>
                            {s.slug}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {s.ownerName ?? "—"}
                      <small
                        className="a-muted"
                        dir="ltr"
                        style={{ display: "block", textAlign: "start" }}
                      >
                        {s.ownerEmail}
                      </small>
                    </td>
                    <td>
                      <PlanBadge plan={s.plan} />
                    </td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="a-end num">{s.orders30}</td>
                    <td className="a-end num">
                      {formatShekelsRounded(s.gmv30Agorot)}
                    </td>
                    <td className="a-muted">{timeAgo(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {res.pages > 1 && (
          <nav className="a-pager" aria-label="עימוד">
            <span>
              עמוד <span className="num">{res.page}</span> מתוך{" "}
              <span className="num">{res.pages}</span>
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              {res.page > 1 && (
                <Link
                  className="a-btn a-btn-sm"
                  href={href({ page: String(res.page - 1) })}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                  הקודם
                </Link>
              )}
              {res.page < res.pages && (
                <Link
                  className="a-btn a-btn-sm"
                  href={href({ page: String(res.page + 1) })}
                >
                  הבא
                  <ChevronLeft size={16} aria-hidden="true" />
                </Link>
              )}
            </span>
          </nav>
        )}
      </Card>
    </>
  );
}
