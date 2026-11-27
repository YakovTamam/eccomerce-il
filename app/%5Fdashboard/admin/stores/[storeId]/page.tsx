import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  Banknote,
  Bot,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  MessageCircle,
  Package,
  ShoppingBag,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Card,
  Empty,
  PlanBadge,
  Stat,
  StatusBadge,
  cx,
} from "@/components/admin/ui";
import {
  CopyButton,
  DomainAddForm,
  PlanForm,
  SuspendControl,
  WhatsappForm,
} from "@/components/admin/forms";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { getStoreAdmin } from "@/lib/admin/queries";
import { ACTION_LABELS, describeDetails, timeAgo } from "@/lib/admin/format";
import { formatShekelsRounded } from "@/lib/catalog/money";
import { storeBaseUrl } from "@/lib/storefront/urls";
import {
  primaryDomainAction,
  removeDomainAction,
  revokeAllAction,
  unverifyDomainAction,
  verifyDomainAction,
} from "../../actions";

export async function generateMetadata() {
  return { title: "חנות" };
}

const ROLE = { owner: "בעלים", admin: "מנהל", staff: "צוות" } as const;
const WA = {
  pending: ["warning", "ממתין להפעלה"],
  active: ["success", "פעיל"],
  disabled: ["neutral", "מושבת"],
} as const;

export default async function StoreAdminPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  if (!z.string().uuid().safeParse(storeId).success) notFound();
  const d = await getStoreAdmin(storeId);
  if (!d) notFound();
  const { store, stats } = d;
  const primary =
    d.domains.find((x) => x.isPrimary && x.verifiedAt)?.hostname ?? null;
  const url = storeBaseUrl({ slug: store.slug, primaryDomain: primary });

  return (
    <>
      <nav aria-label="פירורי לחם">
        <Link
          href="/admin/stores"
          className="a-link"
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <ChevronRight size={16} aria-hidden="true" />
          כל החנויות
        </Link>
      </nav>

      <div
        className="a-card a-card-pad"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          alignItems: "center",
        }}
      >
        <Avatar name={store.name} large />
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
              {store.name}
            </h1>
            <StatusBadge status={store.status} />
            <PlanBadge plan={store.plan} />
          </div>
          <p
            className="a-muted"
            style={{
              margin: "4px 0 0",
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="a-link"
              style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
            >
              {url.replace(/^https?:\/\//, "")}
              <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only">(נפתח בלשונית חדשה)</span>
            </a>
            <CopyButton text={url} label="העתקת כתובת החנות" />
            <span>· נוצרה {timeAgo(store.createdAt)}</span>
          </p>
        </div>
        <SuspendControl
          storeId={store.id}
          status={store.status}
          name={store.name}
        />
      </div>

      {store.status === "suspended" && (
        <div
          role="status"
          className="a-card a-card-pad"
          style={{
            borderColor: "var(--a-danger-text)",
            background: "var(--a-danger-bg)",
            color: "var(--a-danger-text)",
          }}
        >
          <b>החנות מושעית.</b> היא אינה מוגשת ללקוחות, בעלי העסק אינם יכולים
          לנהל אותה, וחיבורי Claude מנותקים.
        </div>
      )}

      <div className="a-grid a-grid-4">
        <Stat
          label="מכירות (30 ימים)"
          value={formatShekelsRounded(stats.gmv30Agorot)}
          icon={Banknote}
          spark={d.series.map((p) => p.gmvAgorot)}
          sparkLabel="מגמת מכירות, 30 ימים"
          hint={`${formatShekelsRounded(stats.gmvTotalAgorot)} סה״כ`}
        />
        <Stat
          label="הזמנות (30 ימים)"
          value={String(stats.orders30)}
          icon={ShoppingBag}
          spark={d.series.map((p) => p.orders)}
          sparkLabel="מגמת הזמנות, 30 ימים"
          hint={`${stats.orders} סה״כ`}
        />
        <Stat
          label="מוצרים פעילים"
          value={String(stats.activeProducts)}
          icon={Package}
          hint={`${stats.products} סה״כ`}
        />
        <Stat
          label="עמודים מפורסמים"
          value={String(stats.publishedPages)}
          icon={FileText}
        />
      </div>

      <div className="a-grid a-grid-main">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
          }}
        >
          <Card title="מכירות יומיות">
            <RevenueChart
              points={d.series}
              title={`מכירות יומיות של ${store.name}, 30 ימים אחרונים`}
            />
          </Card>

          <Card title="דומיינים">
            {d.domains.length === 0 ? (
              <Empty
                icon={Globe}
                title="אין דומיין פרטי"
                hint={`החנות זמינה בכתובת ${store.slug} תחת דומיין הפלטפורמה.`}
              />
            ) : (
              <div className="a-table-wrap">
                <table className="a-table">
                  <caption className="sr-only">דומיינים של החנות</caption>
                  <thead>
                    <tr>
                      <th scope="col">דומיין</th>
                      <th scope="col">מצב</th>
                      <th scope="col" className="a-end">
                        פעולות
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.domains.map((dom) => (
                      <tr key={dom.id}>
                        <td
                          dir="ltr"
                          style={{ textAlign: "start", fontWeight: 600 }}
                        >
                          {dom.hostname}
                        </td>
                        <td
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          {dom.verifiedAt ? (
                            <Badge tone="success">מאומת</Badge>
                          ) : (
                            <Badge tone="warning">ממתין לאימות</Badge>
                          )}
                          {dom.isPrimary && <Badge tone="accent">ראשי</Badge>}
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
                            {dom.verifiedAt ? (
                              <>
                                {!dom.isPrimary && (
                                  <DomBtn
                                    action={primaryDomainAction}
                                    id={dom.id}
                                    label="הגדרה כראשי"
                                    name={dom.hostname}
                                  />
                                )}
                                <DomBtn
                                  action={unverifyDomainAction}
                                  id={dom.id}
                                  label="ביטול אימות"
                                  name={dom.hostname}
                                />
                              </>
                            ) : (
                              <DomBtn
                                action={verifyDomainAction}
                                id={dom.id}
                                label="אימות"
                                name={dom.hostname}
                                primary
                              />
                            )}
                            <DomBtn
                              action={removeDomainAction}
                              id={dom.id}
                              label="הסרה"
                              name={dom.hostname}
                              danger
                            />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ marginBlockStart: 16 }}>
              <DomainAddForm storeId={store.id} />
            </div>
          </Card>

          <Card
            title="וואטסאפ"
            action={
              d.whatsapp ? (
                <Badge tone={WA[d.whatsapp.status][0]}>
                  {WA[d.whatsapp.status][1]}
                </Badge>
              ) : (
                <Badge>לא מחובר</Badge>
              )
            }
          >
            <WhatsappForm storeId={store.id} account={d.whatsapp} />
          </Card>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
          }}
        >
          <Card title="תוכנית">
            <PlanForm storeId={store.id} plan={store.plan} />
          </Card>

          <Card
            title="חברי צוות"
            action={<Badge icon={Users}>{d.members.length}</Badge>}
          >
            <ul className="a-list">
              {d.members.map((m) => (
                <li key={m.email}>
                  <Avatar name={m.name} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{m.name}</b>
                    <small
                      className="a-muted"
                      dir="ltr"
                      style={{ display: "block", textAlign: "start" }}
                    >
                      {m.email}
                    </small>
                  </span>
                  <Badge tone={m.role === "owner" ? "accent" : "neutral"}>
                    {ROLE[m.role as keyof typeof ROLE]}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="חיבורי Claude (MCP)"
            action={<Badge icon={Bot}>{d.mcpGrants}</Badge>}
          >
            <p className="a-muted" style={{ marginBlockStart: 0 }}>
              {d.mcpGrants === 0
                ? "אין חיבורים פעילים."
                : `${d.mcpGrants} חיבורים פעילים לחנות הזו.`}
            </p>
            {d.mcpGrants > 0 && (
              <form action={revokeAllAction}>
                <input type="hidden" name="storeId" value={store.id} />
                <button className="a-btn a-btn-danger a-btn-sm">
                  ניתוק כל החיבורים
                </button>
              </form>
            )}
          </Card>

          <Card title="פעילות אחרונה">
            {d.platformLog.length + d.storeLog.length === 0 ? (
              <Empty icon={MessageCircle} title="אין פעילות עדיין" />
            ) : (
              <ul className="a-list">
                {d.platformLog.map((l, i) => (
                  <li key={`p${i}`}>
                    <span style={{ flex: 1 }}>
                      <b>{ACTION_LABELS[l.action] ?? l.action}</b>
                      <small className="a-muted" style={{ display: "block" }}>
                        {l.actor ?? "מערכת"} · {timeAgo(l.createdAt)}{" "}
                        {describeDetails(l.action, l.details) &&
                          `· ${describeDetails(l.action, l.details)}`}
                      </small>
                    </span>
                    <Badge tone="accent">מנהל</Badge>
                  </li>
                ))}
                {d.storeLog.slice(0, 4).map((l, i) => (
                  <li key={`s${i}`}>
                    <span style={{ flex: 1 }}>
                      <span dir="ltr" style={{ fontWeight: 600 }}>
                        {l.action}
                      </span>
                      <small className="a-muted" style={{ display: "block" }}>
                        {timeAgo(l.createdAt)}
                      </small>
                    </span>
                    <Badge>
                      {l.actorType === "mcp"
                        ? "Claude"
                        : l.actorType === "user"
                          ? "משתמש"
                          : l.actorType}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function DomBtn({
  action,
  id,
  label,
  name,
  primary,
  danger,
}: {
  action: (fd: FormData) => Promise<void>;
  id: string;
  label: string;
  name: string;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="domainId" value={id} />
      <button
        className={cx(
          "a-btn",
          "a-btn-sm",
          primary && "a-btn-primary",
          danger && "a-btn-danger",
        )}
        aria-label={`${label}: ${name}`}
      >
        {label}
      </button>
    </form>
  );
}
