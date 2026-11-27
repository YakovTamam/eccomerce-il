import Link from "next/link";
import { connection } from "next/server";
import {
  AlertTriangle,
  ArrowUpLeft,
  Banknote,
  Bot,
  CircleCheck,
  Globe,
  MessageCircle,
  Pause,
  ShoppingBag,
  Store,
  TriangleAlert,
  CreditCard,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Card,
  Empty,
  PageHead,
  PlanBadge,
  Stat,
} from "@/components/admin/ui";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { adminOverview, listAdminAudit } from "@/lib/admin/queries";
import {
  ACTION_LABELS,
  describeDetails,
  pctChange,
  timeAgo,
} from "@/lib/admin/format";
import { formatShekelsRounded } from "@/lib/catalog/money";

export const metadata = { title: "סקירה" };

export default async function AdminHome() {
  await connection(); // live platform data: request time only, never prerendered
  const [o, audit] = await Promise.all([
    adminOverview(),
    listAdminAudit({ limit: 5 }),
  ]);
  const attention = [
    {
      n: o.health.failedJobs,
      label: "משימות רקע שנכשלו",
      href: "/admin/system",
      tone: "danger" as const,
      icon: TriangleAlert,
    },
    {
      n: o.health.failedPayments,
      label: "תשלומים שנכשלו (7 ימים)",
      href: "/admin/system",
      tone: "danger" as const,
      icon: CreditCard,
    },
    {
      n: o.health.unverifiedDomains,
      label: "דומיינים ממתינים לאימות",
      href: "/admin/domains",
      tone: "warning" as const,
      icon: Globe,
    },
    {
      n: o.health.waPending,
      label: "חשבונות וואטסאפ ממתינים להפעלה",
      href: "/admin/stores",
      tone: "warning" as const,
      icon: MessageCircle,
    },
    {
      n: o.stores.suspended,
      label: "חנויות מושעות",
      href: "/admin/stores?status=suspended",
      tone: "neutral" as const,
      icon: Pause,
    },
  ].filter((a) => a.n > 0);

  return (
    <>
      <PageHead
        title="סקירת פלטפורמה"
        description="תמונת מצב של כל החנויות ב-30 הימים האחרונים"
        actions={
          <Link href="/admin/stores" className="a-btn a-btn-primary">
            <Store size={16} aria-hidden="true" />
            כל החנויות
          </Link>
        }
      />

      <div className="a-grid a-grid-4">
        <Stat
          label="היקף מכירות"
          value={formatShekelsRounded(o.gmv30Agorot)}
          icon={Banknote}
          delta={pctChange(o.gmv30Agorot, o.gmvPrevAgorot)}
          deltaLabel="לעומת 30 הימים הקודמים"
          spark={o.series.map((p) => p.gmvAgorot)}
          sparkLabel="מגמת היקף מכירות, 30 ימים"
        />
        <Stat
          label="הזמנות ששולמו"
          value={String(o.orders30)}
          icon={ShoppingBag}
          delta={pctChange(o.orders30, o.ordersPrev)}
          deltaLabel="לעומת 30 הימים הקודמים"
          spark={o.series.map((p) => p.orders)}
          sparkLabel="מגמת הזמנות, 30 ימים"
        />
        <Stat
          label="חנויות פעילות"
          value={String(o.stores.active)}
          icon={Store}
          hint={`${o.stores.new30} חדשות החודש · ${o.stores.total} סה״כ`}
          href="/admin/stores"
        />
        <Stat
          label="חיבורי Claude פעילים"
          value={String(o.health.mcpGrants)}
          icon={Bot}
          hint="MCP + OAuth"
        />
      </div>

      <div className="a-grid a-grid-main">
        <Card title="היקף מכירות יומי — כל החנויות">
          <RevenueChart
            points={o.series}
            title="היקף מכירות יומי, כל החנויות, 30 הימים האחרונים"
          />
        </Card>
        <Card title="דורש תשומת לב">
          {attention.length === 0 ? (
            <Empty
              icon={CircleCheck}
              title="הכול תקין"
              hint="אין משימות או תשלומים תקועים."
            />
          ) : (
            <ul className="a-list">
              {attention.map((a) => (
                <li key={a.label}>
                  <Link href={a.href} className="a-attn">
                    <Badge tone={a.tone} icon={a.icon}>
                      <span className="num">{a.n}</span>
                    </Badge>
                    <span style={{ flex: 1 }}>{a.label}</span>
                    <ArrowUpLeft
                      size={16}
                      aria-hidden="true"
                      className="a-muted"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="a-grid a-grid-2">
        <Card
          title="חנויות חדשות"
          action={
            <Link href="/admin/stores" className="a-link">
              לכולן
            </Link>
          }
        >
          {o.recentStores.length === 0 ? (
            <Empty icon={Store} title="עדיין אין חנויות" />
          ) : (
            <ul className="a-list">
              {o.recentStores.map((s) => (
                <li key={s.id}>
                  <Avatar name={s.name} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/admin/stores/${s.id}`}
                      className="a-link"
                      style={{ color: "var(--a-text)" }}
                    >
                      {s.name}
                    </Link>
                    <small className="a-muted" style={{ display: "block" }}>
                      {s.owner ?? "—"} · {timeAgo(s.createdAt)}
                    </small>
                  </span>
                  <PlanBadge plan={s.plan as "basic"} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title="פעולות אחרונות של מנהלים"
          action={
            <Link href="/admin/audit" className="a-link">
              ליומן המלא
            </Link>
          }
        >
          {audit.length === 0 ? (
            <Empty
              icon={AlertTriangle}
              title="עדיין לא בוצעו פעולות"
              hint="כל פעולת ניהול תירשם כאן."
            />
          ) : (
            <ul className="a-list">
              {audit.map((a) => (
                <li key={a.id}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{ACTION_LABELS[a.action] ?? a.action}</b>{" "}
                    {a.slug && (
                      <span className="a-muted" dir="ltr">
                        · {a.slug}
                      </span>
                    )}
                    <small className="a-muted" style={{ display: "block" }}>
                      {a.actor ?? "מערכת"} · {timeAgo(a.createdAt)}{" "}
                      {describeDetails(a.action, a.details) &&
                        `· ${describeDetails(a.action, a.details)}`}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
