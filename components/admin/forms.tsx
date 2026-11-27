"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, Pause, Play, Save } from "lucide-react";
import {
  activateStoreAction,
  addDomainAction,
  planAction,
  suspendStoreAction,
  whatsappAction,
  type AState,
} from "@/app/%5Fdashboard/admin/actions";

const Msg = ({ s }: { s: AState }) => (
  <p
    className="a-msg"
    role="status"
    aria-live="polite"
    data-tone={s.error ? "error" : "ok"}
  >
    {s.error ?? s.ok}
  </p>
);

export function SuspendControl({
  storeId,
  status,
  name,
}: {
  storeId: string;
  status: "active" | "suspended";
  name: string;
}) {
  const [state, action, pending] = useActionState<AState, FormData>(
    suspendStoreAction,
    {},
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (state.ok) dialog.current?.close();
  }, [state.ok]);

  if (status === "suspended") {
    return (
      <form action={activateStoreAction}>
        <input type="hidden" name="storeId" value={storeId} />
        <button className="a-btn a-btn-primary">
          <Play size={16} aria-hidden="true" />
          הפעלה מחדש
        </button>
      </form>
    );
  }
  return (
    <>
      <button
        type="button"
        className="a-btn a-btn-danger"
        onClick={() => dialog.current?.showModal()}
      >
        <Pause size={16} aria-hidden="true" />
        השעיית חנות
      </button>
      <dialog ref={dialog} className="a-dialog" aria-labelledby="suspend-title">
        <form action={action}>
          <input type="hidden" name="storeId" value={storeId} />
          <h2 id="suspend-title" style={{ margin: 0, fontSize: 20 }}>
            להשעות את ״{name}״?
          </h2>
          <p className="a-muted" style={{ margin: 0 }}>
            החנות תפסיק להיות זמינה ללקוחות, בעלי העסק לא יוכלו לנהל אותה,
            וחיבורי Claude יתנתקו. הנתונים נשמרים, וההשעיה ניתנת לביטול בכל עת.
          </p>
          <label className="a-field">
            סיבת ההשעיה (נשמרת ביומן)
            <textarea
              name="reason"
              className="a-textarea"
              required
              minLength={3}
              maxLength={300}
            />
          </label>
          <Msg s={state} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="a-btn"
              onClick={() => dialog.current?.close()}
            >
              ביטול
            </button>
            <button disabled={pending} className="a-btn a-btn-danger">
              {pending ? "משעה..." : "השעיה"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function PlanForm({
  storeId,
  plan,
}: {
  storeId: string;
  plan: "basic" | "pro" | "growth";
}) {
  const [state, action, pending] = useActionState<AState, FormData>(
    planAction,
    {},
  );
  return (
    <form
      action={action}
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        flexWrap: "wrap",
      }}
    >
      <input type="hidden" name="storeId" value={storeId} />
      <label className="a-field" style={{ minWidth: 150 }}>
        שינוי תוכנית
        <select name="plan" defaultValue={plan} className="a-select">
          <option value="basic">בסיס</option>
          <option value="pro">פרו</option>
          <option value="growth">צמיחה</option>
        </select>
      </label>
      <button disabled={pending} className="a-btn">
        <Save size={16} aria-hidden="true" />
        שמירה
      </button>
      <Msg s={state} />
    </form>
  );
}

export function DomainAddForm({ storeId }: { storeId: string }) {
  const [state, action, pending] = useActionState<AState, FormData>(
    addDomainAction,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);
  return (
    <form
      ref={ref}
      action={action}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <input type="hidden" name="storeId" value={storeId} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label className="a-field" style={{ flex: 1, minWidth: 220 }}>
          הוספת דומיין פרטי
          <input
            name="hostname"
            dir="ltr"
            className="a-input"
            placeholder="shop.example.co.il"
            required
          />
        </label>
        <button
          disabled={pending}
          className="a-btn a-btn-primary"
          style={{ alignSelf: "flex-end" }}
        >
          הוספה
        </button>
      </div>
      <Msg s={state} />
    </form>
  );
}

export function WhatsappForm({
  storeId,
  account,
}: {
  storeId: string;
  account: {
    phoneNumberId: string;
    wabaId: string;
    displayPhone: string;
    status: "pending" | "active" | "disabled";
  } | null;
}) {
  const [state, action, pending] = useActionState<AState, FormData>(
    whatsappAction,
    {},
  );
  return (
    <form
      action={action}
      style={{
        display: "grid",
        gap: 14,
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}
    >
      <input type="hidden" name="storeId" value={storeId} />
      <label className="a-field">
        Phone Number ID
        <input
          name="phoneNumberId"
          dir="ltr"
          className="a-input"
          defaultValue={account?.phoneNumberId}
          required
          inputMode="numeric"
        />
      </label>
      <label className="a-field">
        WhatsApp Business Account ID
        <input
          name="wabaId"
          dir="ltr"
          className="a-input"
          defaultValue={account?.wabaId}
          required
          inputMode="numeric"
        />
      </label>
      <label className="a-field">
        מספר תצוגה
        <input
          name="displayPhone"
          dir="ltr"
          className="a-input"
          defaultValue={account?.displayPhone}
          required
          placeholder="050-1234567"
        />
      </label>
      <label className="a-field">
        סטטוס
        <select
          name="status"
          className="a-select"
          defaultValue={account?.status ?? "pending"}
        >
          <option value="pending">ממתין להפעלה</option>
          <option value="active">פעיל</option>
          <option value="disabled">מושבת</option>
        </select>
      </label>
      <label className="a-field" style={{ gridColumn: "1 / -1" }}>
        טוקן גישה (System User)
        <input
          name="accessToken"
          type="password"
          dir="ltr"
          autoComplete="off"
          className="a-input"
          placeholder={
            account ? "•••••••• — השאירו ריק כדי לשמור את הקיים" : "הדביקו טוקן"
          }
          required={!account}
        />
        <small>נשמר מוצפן (AES-256-GCM) ולא מוצג שוב לאחר השמירה.</small>
      </label>
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button disabled={pending} className="a-btn a-btn-primary">
          <Save size={16} aria-hidden="true" />
          {account ? "עדכון חיבור" : "חיבור חשבון"}
        </button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="a-btn a-btn-sm a-btn-ghost"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {}
      }}
    >
      {done ? (
        <Check size={16} aria-hidden="true" />
      ) : (
        <Copy size={16} aria-hidden="true" />
      )}
      <span role="status">{done ? "הועתק" : ""}</span>
    </button>
  );
}
