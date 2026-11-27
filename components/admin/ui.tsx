import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  Layers,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/** Joins class names; avoids template strings (Prettier's Tailwind plugin trims spaces inside them). */
export const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

export type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

export function Badge({
  tone = "neutral",
  icon: Icon,
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span className="a-badge" data-tone={tone}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </span>
  );
}

export const StatusBadge = ({ status }: { status: "active" | "suspended" }) =>
  status === "active" ? (
    <Badge tone="success" icon={CheckCircle2}>
      פעילה
    </Badge>
  ) : (
    <Badge tone="danger" icon={Ban}>
      מושעית
    </Badge>
  );

const PLAN = { basic: "בסיס", pro: "פרו", growth: "צמיחה" } as const;
export const PlanBadge = ({ plan }: { plan: keyof typeof PLAN }) => (
  <Badge
    tone={plan === "basic" ? "neutral" : "accent"}
    icon={plan === "basic" ? undefined : Layers}
  >
    {PLAN[plan]}
  </Badge>
);
export const planLabel = (p: keyof typeof PLAN) => PLAN[p];

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  return (
    <span className={cx("a-avatar", large && "a-avatar-lg")} aria-hidden="true">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function PageHead({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="a-page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  pad = true,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  pad?: boolean;
}) {
  return (
    <section className="a-card" aria-label={title}>
      {title && (
        <div className="a-card-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      <div
        className={pad ? "a-card-body" : undefined}
        style={pad ? undefined : { paddingBlockStart: title ? 14 : 0 }}
      >
        {children}
      </div>
    </section>
  );
}

export function Empty({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="a-empty">
      <span className="a-chip">
        <Icon size={22} aria-hidden="true" />
      </span>
      <b style={{ color: "var(--a-text)" }}>{title}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}

/** Tiny inline trend (one series, no axes): the number beside it carries the value. */
export function Sparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  const W = 120;
  const H = 36;
  const max = Math.max(...values, 1);
  const pts = values.map(
    (v, i) =>
      [
        (i * W) / Math.max(values.length - 1, 1),
        H - 4 - (v / max) * (H - 10),
      ] as const,
  );
  const line = pts
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const last = pts.at(-1)!;
  return (
    <svg
      className="a-spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      style={{ direction: "ltr" }}
    >
      <path className="area" d={`${line} L${W} ${H} L0 ${H} Z`} />
      <path className="line" d={line} />
      <circle cx={last[0]} cy={last[1]} r={3.5} />
    </svg>
  );
}

export function Delta({
  pct,
  label = "לעומת התקופה הקודמת",
}: {
  pct: number | null;
  label?: string;
}) {
  if (pct === null) return <Badge tone="accent">חדש</Badge>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span title={label}>
      <Badge
        tone={pct === 0 ? "neutral" : up ? "success" : "danger"}
        icon={pct === 0 ? undefined : Icon}
      >
        <span className="num">{Math.abs(pct)}%</span>
        <span className="sr-only">
          {pct === 0 ? "ללא שינוי" : up ? "עלייה" : "ירידה"} {label}
        </span>
      </Badge>
    </span>
  );
}

export function Stat({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel,
  spark,
  sparkLabel,
  hint,
  href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: number | null;
  deltaLabel?: string;
  spark?: number[];
  sparkLabel?: string;
  hint?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="a-stat-top">
        <span>{label}</span>
        <span className="a-chip">
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <div className="a-stat-value num">{value}</div>
      <div className="a-stat-foot">
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {delta !== undefined && <Delta pct={delta} label={deltaLabel} />}
          {hint && <span>{hint}</span>}
        </span>
        {spark && (
          <span style={{ width: 96 }}>
            {<Sparkline values={spark} label={sparkLabel ?? `מגמת ${label}`} />}
          </span>
        )}
      </div>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="a-card a-stat"
      style={{ textDecoration: "none" }}
    >
      {body}
    </Link>
  ) : (
    <div className="a-card a-stat">{body}</div>
  );
}
