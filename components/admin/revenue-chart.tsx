"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Table2, LineChart } from "lucide-react";
import { formatAgorot, formatCompactShekels } from "@/lib/catalog/money";

type Point = { day: string; gmvAgorot: number; orders: number };

const W = 800;
const H = 240;
const PAD = { l: 56, r: 14, t: 14, b: 30 };

/** 1/2/2.5/5 × 10^k "nice" axis maximum, in agorot (integers). */
function niceMax(maxAgorot: number): number {
  const sh = Math.max(maxAgorot / 100, 1);
  const mag = 10 ** Math.floor(Math.log10(sh));
  for (const m of [1, 2, 2.5, 5, 10])
    if (m * mag >= sh) return Math.round(m * mag * 100);
  return Math.round(10 * mag * 100);
}

const fmtDay = (iso: string, long = false) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(
    "he-IL",
    long
      ? { weekday: "long", day: "numeric", month: "long" }
      : { day: "numeric", month: "numeric" },
  );

/** One series, so no legend: the card title names it. Hover/keyboard crosshair + tooltip, and a table view. */
export function RevenueChart({
  points,
  title,
}: {
  points: Point[];
  title: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  const { max, xs, ys, line, area, ticks } = useMemo(() => {
    const max = niceMax(Math.max(...points.map((p) => p.gmvAgorot), 0));
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const xs = points.map(
      (_, i) => PAD.l + (i * innerW) / Math.max(points.length - 1, 1),
    );
    const ys = points.map((p) => PAD.t + innerH - (p.gmvAgorot / max) * innerH);
    const line = xs
      .map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${ys[i].toFixed(1)}`)
      .join(" ");
    const area = `${line} L${xs.at(-1)!.toFixed(1)} ${PAD.t + innerH} L${xs[0].toFixed(1)} ${PAD.t + innerH} Z`;
    const ticks = [0, 0.5, 1].map((f) => ({
      y: PAD.t + innerH - f * innerH,
      label: formatCompactShekels(Math.round(max * f)),
    }));
    return { max, xs, ys, line, area, ticks };
  }, [points]);
  void max;

  const total = points.reduce((a, p) => a + p.gmvAgorot, 0);
  const idxFromX = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++)
      if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    return best;
  };
  const p = hover === null ? null : points[hover];
  const leftPct = hover === null ? 0 : (xs[hover] / W) * 100;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBlockEnd: 10,
        }}
      >
        <p className="a-muted" style={{ margin: 0 }}>
          סה״כ ב-{points.length} הימים האחרונים:{" "}
          <b className="num" style={{ color: "var(--a-text)" }}>
            {formatAgorot(total)}
          </b>
        </p>
        <button
          type="button"
          className="a-btn a-btn-sm"
          aria-pressed={table}
          onClick={() => setTable((t) => !t)}
        >
          {table ? (
            <LineChart size={16} aria-hidden="true" />
          ) : (
            <Table2 size={16} aria-hidden="true" />
          )}
          {table ? "הצגת גרף" : "הצגת טבלה"}
        </button>
      </div>

      {table ? (
        <div
          className="a-table-wrap"
          style={{ maxHeight: 280, overflowY: "auto" }}
        >
          <table className="a-table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">תאריך</th>
                <th scope="col" className="a-end">
                  הזמנות
                </th>
                <th scope="col" className="a-end">
                  היקף מכירות
                </th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{fmtDay(d.day, true)}</td>
                  <td className="a-end num">{d.orders}</td>
                  <td className="a-end num">{formatAgorot(d.gmvAgorot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="a-chart"
          ref={wrap}
          tabIndex={0}
          role="group"
          aria-label={`${title}. חצים ימינה ושמאלה לבחירת יום.`}
          onPointerMove={(e) => setHover(idxFromX(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover((h) => h ?? points.length - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setHover((h) =>
                Math.min(
                  Math.max(
                    (h ?? points.length - 1) +
                      (e.key === "ArrowRight" ? 1 : -1),
                    0,
                  ),
                  points.length - 1,
                ),
              );
            }
            if (e.key === "Escape") setHover(null);
          }}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ direction: "ltr" }}
            aria-hidden="true"
          >
            {ticks.map((t) => (
              <g key={t.y}>
                <line
                  className="a-chart-grid"
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={t.y}
                  y2={t.y}
                />
                <text
                  className="a-chart-axis"
                  x={PAD.l - 8}
                  y={t.y + 4}
                  textAnchor="end"
                >
                  {t.label}
                </text>
              </g>
            ))}
            {[
              0,
              Math.floor(points.length / 3),
              Math.floor((2 * points.length) / 3),
              points.length - 1,
            ].map((i) => (
              <text
                key={i}
                className="a-chart-axis"
                x={xs[i]}
                y={H - 8}
                textAnchor="middle"
              >
                {fmtDay(points[i].day)}
              </text>
            ))}
            <path className="a-chart-area" d={area} />
            <path className="a-chart-line" d={line} />
            {hover !== null && (
              <g>
                <line
                  className="a-chart-cursor"
                  x1={xs[hover]}
                  x2={xs[hover]}
                  y1={PAD.t}
                  y2={H - PAD.b}
                />
                <circle
                  className="a-chart-dot"
                  cx={xs[hover]}
                  cy={ys[hover]}
                  r={5}
                />
              </g>
            )}
          </svg>
          {p && (
            <div
              className="a-tooltip"
              style={{
                insetInlineStart: "auto",
                left: `${leftPct}%`,
                top: 0,
                transform: `translate(${leftPct > 60 ? "calc(-100% - 14px)" : "14px"}, 0)`,
              }}
              role="presentation"
            >
              <span className="a-muted">{fmtDay(p.day, true)}</span>
              <b className="num">{formatAgorot(p.gmvAgorot)}</b>
              <span className="a-muted num">{p.orders} הזמנות</span>
            </div>
          )}
          <p className="sr-only" aria-live="polite" id={id}>
            {p
              ? `${fmtDay(p.day, true)}: ${formatAgorot(p.gmvAgorot)}, ${p.orders} הזמנות`
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
