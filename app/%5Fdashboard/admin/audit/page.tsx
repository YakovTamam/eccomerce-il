import Link from "next/link";
import { connection } from "next/server";
import {
  Globe,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  ScrollText,
  Layers,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { Card, Empty, PageHead } from "@/components/admin/ui";
import { listAdminAudit } from "@/lib/admin/queries";
import { ACTION_LABELS, describeDetails, timeAgo } from "@/lib/admin/format";

export const metadata = { title: "יומן פעולות" };

const ICON: Record<string, LucideIcon> = {
  "store.suspend": Pause,
  "store.activate": Play,
  "store.plan_change": Layers,
  "job.retry": RefreshCw,
  "mcp.revoke_all": Bot,
};
const iconFor = (a: string): LucideIcon =>
  ICON[a] ??
  (a.startsWith("domain")
    ? Globe
    : a.startsWith("whatsapp")
      ? MessageCircle
      : ScrollText);

export default async function AuditPage() {
  await connection(); // live platform data: request time only, never prerendered
  const rows = await listAdminAudit({ limit: 150 });
  return (
    <>
      <PageHead
        title="יומן פעולות"
        description="כל פעולה של מנהל פלטפורמה נרשמת כאן: מי, מתי ומה השתנה"
      />
      <Card>
        {rows.length === 0 ? (
          <Empty
            icon={ScrollText}
            title="עדיין אין פעולות"
            hint="פעולות ניהול יופיעו כאן."
          />
        ) : (
          <ol className="a-list">
            {rows.map((r) => {
              const Icon = iconFor(r.action);
              return (
                <li key={r.id}>
                  <span className="a-chip">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{ACTION_LABELS[r.action] ?? r.action}</b>
                    {r.slug && (
                      <>
                        {" "}
                        <span className="a-muted">·</span>{" "}
                        <Link href="/admin/stores" className="a-link" dir="ltr">
                          {r.slug}
                        </Link>
                      </>
                    )}
                    {describeDetails(r.action, r.details) && (
                      <span className="a-muted">
                        {" "}
                        — {describeDetails(r.action, r.details)}
                      </span>
                    )}
                    <small className="a-muted" style={{ display: "block" }}>
                      {r.actor ?? "מערכת"}
                    </small>
                  </span>
                  <time
                    className="a-muted"
                    dateTime={r.createdAt.toISOString()}
                    title={r.createdAt.toLocaleString("he-IL")}
                  >
                    {timeAgo(r.createdAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </>
  );
}
