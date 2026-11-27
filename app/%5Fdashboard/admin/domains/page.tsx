import Link from "next/link";
import { connection } from "next/server";
import { Globe } from "lucide-react";
import { Badge, Card, Empty, PageHead, cx } from "@/components/admin/ui";
import { listDomainsAdmin } from "@/lib/admin/queries";
import {
  removeDomainAction,
  unverifyDomainAction,
  verifyDomainAction,
} from "../actions";

export const metadata = { title: "דומיינים" };

export default async function DomainsPage() {
  await connection(); // live platform data: request time only, never prerendered
  const rows = await listDomainsAdmin();
  const pending = rows.filter((r) => !r.verifiedAt).length;
  return (
    <>
      <PageHead
        title="דומיינים"
        description={
          pending
            ? `${pending} דומיינים ממתינים לאימות. אמתו רק לאחר שהוגדרו רשומות ה-DNS.`
            : "כל הדומיינים הפרטיים מאומתים."
        }
      />
      <Card pad={false}>
        {rows.length === 0 ? (
          <Empty
            icon={Globe}
            title="אין דומיינים פרטיים"
            hint="דומיין נוסף מתוך עמוד החנות."
          />
        ) : (
          <div className="a-table-wrap">
            <table className="a-table">
              <caption className="sr-only">כל הדומיינים הפרטיים</caption>
              <thead>
                <tr>
                  <th scope="col">דומיין</th>
                  <th scope="col">חנות</th>
                  <th scope="col">מצב</th>
                  <th scope="col" className="a-end">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td
                      dir="ltr"
                      style={{ textAlign: "start", fontWeight: 600 }}
                    >
                      {r.hostname}
                    </td>
                    <td>
                      <Link
                        href={`/admin/stores/${r.storeId}`}
                        className="a-link"
                      >
                        {r.storeName}
                      </Link>
                    </td>
                    <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {r.verifiedAt ? (
                        <Badge tone="success">מאומת</Badge>
                      ) : (
                        <Badge tone="warning">ממתין לאימות</Badge>
                      )}
                      {r.isPrimary && <Badge tone="accent">ראשי</Badge>}
                    </td>
                    <td className="a-end">
                      <span
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        {[
                          r.verifiedAt
                            ? ([
                                unverifyDomainAction,
                                "ביטול אימות",
                                "",
                              ] as const)
                            : ([
                                verifyDomainAction,
                                "אימות",
                                "a-btn-primary",
                              ] as const),
                          [removeDomainAction, "הסרה", "a-btn-danger"] as const,
                        ].map(([act, label, cls]) => (
                          <form key={label} action={act}>
                            <input type="hidden" name="domainId" value={r.id} />
                            <button
                              className={cx("a-btn", "a-btn-sm", cls)}
                              aria-label={`${label}: ${r.hostname}`}
                            >
                              {label}
                            </button>
                          </form>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
