import Link from "next/link";
import { connection } from "next/server";
import {
  Bot,
  CircleCheck,
  CreditCard,
  Inbox,
  RefreshCw,
  Server,
  TriangleAlert,
} from "lucide-react";
import { Badge, Card, Empty, PageHead, Stat } from "@/components/admin/ui";
import { systemHealth } from "@/lib/admin/queries";
import { timeAgo } from "@/lib/admin/format";
import { formatAgorot } from "@/lib/catalog/money";
import { retryJobAction } from "../actions";

export const metadata = { title: "בריאות המערכת" };

export default async function SystemPage() {
  await connection(); // live platform data: request time only, never prerendered
  const h = await systemHealth();
  return (
    <>
      <PageHead
        title="בריאות המערכת"
        description="משימות רקע, תשלומים שנכשלו וחיבורים פעילים"
      />
      <div className="a-grid a-grid-4">
        <Stat
          label="משימות ממתינות"
          value={String(h.outbox.pending)}
          icon={Inbox}
          hint="outbox"
        />
        <Stat
          label="משימות שנכשלו"
          value={String(h.outbox.failed)}
          icon={TriangleAlert}
          hint={h.outbox.failed ? "דורש טיפול" : "הכול תקין"}
        />
        <Stat
          label="טיוטות ממתינות"
          value={String(h.infra.pendingDrafts)}
          icon={Server}
        />
        <Stat
          label="חיבורי Claude"
          value={String(h.infra.mcpGrants)}
          icon={Bot}
        />
      </div>

      <Card title="משימות רקע שנכשלו" pad={false}>
        {h.failedJobs.length === 0 ? (
          <Empty
            icon={CircleCheck}
            title="אין משימות שנכשלו"
            hint="חשבוניות ומיילים מתבצעים כסדרם."
          />
        ) : (
          <div className="a-table-wrap">
            <table className="a-table">
              <caption className="sr-only">משימות רקע שנכשלו</caption>
              <thead>
                <tr>
                  <th scope="col">משימה</th>
                  <th scope="col">חנות</th>
                  <th scope="col">ניסיונות</th>
                  <th scope="col">שגיאה אחרונה</th>
                  <th scope="col">נוצרה</th>
                  <th scope="col" className="a-end">
                    פעולה
                  </th>
                </tr>
              </thead>
              <tbody>
                {h.failedJobs.map((j) => (
                  <tr key={j.id}>
                    <td
                      dir="ltr"
                      style={{ textAlign: "start", fontWeight: 600 }}
                    >
                      {j.type}
                    </td>
                    <td dir="ltr" style={{ textAlign: "start" }}>
                      {j.slug}
                    </td>
                    <td className="num">{j.attempts}</td>
                    <td dir="ltr" style={{ textAlign: "start", maxWidth: 320 }}>
                      <code
                        style={{
                          fontSize: 12.5,
                          color: "var(--a-danger-text)",
                        }}
                      >
                        {(j.lastError ?? "—").slice(0, 120)}
                      </code>
                    </td>
                    <td className="a-muted">{timeAgo(j.createdAt)}</td>
                    <td className="a-end">
                      <form action={retryJobAction}>
                        <input type="hidden" name="jobId" value={j.id} />
                        <button
                          className="a-btn a-btn-sm"
                          aria-label={`ניסיון חוזר: ${j.type} של ${j.slug}`}
                        >
                          <RefreshCw size={14} aria-hidden="true" />
                          נסה שוב
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="תשלומים שנכשלו (7 ימים אחרונים)" pad={false}>
        {h.failedPayments.length === 0 ? (
          <Empty icon={CreditCard} title="אין תשלומים שנכשלו" />
        ) : (
          <div className="a-table-wrap">
            <table className="a-table">
              <caption className="sr-only">תשלומים שנכשלו</caption>
              <thead>
                <tr>
                  <th scope="col">חנות</th>
                  <th scope="col">הזמנה</th>
                  <th scope="col">ספק</th>
                  <th scope="col" className="a-end">
                    סכום
                  </th>
                  <th scope="col">סיבה</th>
                  <th scope="col">זמן</th>
                </tr>
              </thead>
              <tbody>
                {h.failedPayments.map((p) => (
                  <tr key={p.id}>
                    <td dir="ltr" style={{ textAlign: "start" }}>
                      {p.slug}
                    </td>
                    <td className="num">#{p.orderNumber}</td>
                    <td>{p.provider}</td>
                    <td className="a-end num">
                      {formatAgorot(p.amountAgorot)}
                    </td>
                    <td>
                      {p.amountMismatch ? (
                        <Badge tone="danger">אי-התאמת סכום</Badge>
                      ) : (
                        <Badge tone="warning">נדחה / בוטל</Badge>
                      )}
                    </td>
                    <td className="a-muted">{timeAgo(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="a-muted">
        משימות נכשלות מנוסות מחדש אוטומטית עד 5 פעמים.{" "}
        <Link href="/admin/audit" className="a-link">
          יומן הפעולות
        </Link>{" "}
        מתעד כל ניסיון חוזר ידני.
      </p>
    </>
  );
}
