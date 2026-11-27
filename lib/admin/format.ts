const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto" });

export function timeAgo(date: Date, now = new Date()): string {
  const s = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return "הרגע";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(s / 86_400), "day");
  return rtf.format(Math.round(s / (86_400 * 30)), "month");
}

/** Percent change as an integer; null when there is no baseline. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) * 100) / previous);
}

export const ACTION_LABELS: Record<string, string> = {
  "store.suspend": "השעיית חנות",
  "store.activate": "הפעלת חנות",
  "store.plan_change": "שינוי תוכנית",
  "domain.add": "הוספת דומיין",
  "domain.verify": "אימות דומיין",
  "domain.unverify": "ביטול אימות דומיין",
  "domain.set_primary": "הגדרת דומיין ראשי",
  "domain.remove": "הסרת דומיין",
  "whatsapp.connect": "חיבור וואטסאפ",
  "whatsapp.update": "עדכון חיבור וואטסאפ",
  "job.retry": "ניסיון חוזר למשימה",
  "mcp.revoke_all": "ביטול כל חיבורי Claude",
};

/** One-line, human description of an audit entry's details (never includes secrets: none are stored). */
export function describeDetails(
  action: string,
  d: Record<string, unknown>,
): string {
  const v = (k: string) =>
    d[k] === undefined || d[k] === null ? "" : String(d[k]);
  switch (action) {
    case "store.suspend":
      return `סיבה: ${v("reason")}`;
    case "store.plan_change":
      return `${v("from")} ← ${v("to")}`;
    case "domain.add":
    case "domain.verify":
    case "domain.unverify":
    case "domain.set_primary":
    case "domain.remove":
      return v("hostname");
    case "whatsapp.connect":
    case "whatsapp.update":
      return `${v("phoneNumberId")} · ${v("status")}${d.tokenChanged ? " · הטוקן הוחלף" : ""}`;
    case "job.retry":
      return v("type");
    case "mcp.revoke_all":
      return `${v("count")} חיבורים`;
    default:
      return "";
  }
}
