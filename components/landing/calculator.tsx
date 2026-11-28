"use client";

import { useId, useState } from "react";

const toInt = (v: string) =>
  Math.min(
    Math.max(Math.round(Number(v.replace(/[^\d.]/g, "")) || 0), 0),
    10_000_000,
  );
const nf = new Intl.NumberFormat("he-IL");

/** Shows what the merchant spends today (their own numbers). No savings claims: we don't have data for that yet. */
export function CostCalculator() {
  const id = useId();
  const [agency, setAgency] = useState("3000");
  const [uploads, setUploads] = useState("1500");
  const [hours, setHours] = useState("10");
  const monthly = toInt(agency) + toInt(uploads);
  return (
    <div className="lp-card lp-calc">
      <div>
        <h3>כמה זה עולה לכם היום?</h3>
        <p style={{ margin: 0, color: "var(--lp-muted)" }}>
          ערכים לדוגמה. עדכנו לפי המציאות שלכם.
        </p>
        <div className="lp-fields">
          <label className="lp-field" htmlFor={`${id}-a`}>
            סוכנות או פרילנסר לשיווק וקמפיינים (₪ בחודש)
            <input
              id={`${id}-a`}
              className="lp-input"
              inputMode="numeric"
              dir="ltr"
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
            />
          </label>
          <label className="lp-field" htmlFor={`${id}-u`}>
            מי שמעלה מוצרים, מעצב דפים ומעדכן מחירים (₪ בחודש)
            <input
              id={`${id}-u`}
              className="lp-input"
              inputMode="numeric"
              dir="ltr"
              value={uploads}
              onChange={(e) => setUploads(e.target.value)}
            />
          </label>
          <label className="lp-field" htmlFor={`${id}-h`}>
            שעות שלכם בחודש על מוצרים, מלאי ועדכונים
            <input
              id={`${id}-h`}
              className="lp-input"
              inputMode="numeric"
              dir="ltr"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="lp-result" role="status" aria-live="polite">
        <p style={{ margin: "0 0 6px" }}>ההוצאה שלכם על זה היום</p>
        <strong className="lp-grad">₪{nf.format(monthly)}</strong>
        <p>
          בחודש · ₪{nf.format(monthly * 12)} בשנה · ועוד{" "}
          {nf.format(toInt(hours))} שעות מהזמן שלכם
        </p>
        <p className="lp-fine">
          ניהול בשיחה דורש חשבון Claude, שמשולם בנפרד ל-Anthropic. מחירי
          הפלטפורמה יפורסמו בהשקה.
        </p>
      </div>
    </div>
  );
}
