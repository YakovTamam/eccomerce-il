import { formatAgorot } from "@/lib/catalog/money";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import type { EmailMessage } from "./provider";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type OrderMail = {
  storeName: string;
  number: number;
  totalAgorot: number;
  items: { title: string; qty: number; unitPriceAgorot: number }[];
  customerName: string;
};

export function orderConfirmationEmail(
  to: string,
  o: OrderMail,
  invoiceUrl?: string,
): EmailMessage {
  const lines = o.items.map(
    (i) => `${i.title} × ${i.qty} — ${formatAgorot(i.unitPriceAgorot * i.qty)}`,
  );
  const text = [
    `שלום ${o.customerName},`,
    `תודה! התשלום על הזמנה #${o.number} ב-${o.storeName} התקבל.`,
    "",
    ...lines,
    "",
    `סה״כ: ${formatAgorot(o.totalAgorot)} (כולל מע״מ)`,
    invoiceUrl ? `חשבונית: ${invoiceUrl}` : "",
  ].join("\n");
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif"><p>שלום ${esc(o.customerName)},</p><p>תודה! התשלום על הזמנה #${o.number} ב-${esc(o.storeName)} התקבל.</p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p><strong>סה״כ: ${formatAgorot(o.totalAgorot)}</strong> (כולל מע״מ)</p>${invoiceUrl ? `<p><a href="${esc(invoiceUrl)}">חשבונית</a></p>` : ""}</div>`;
  return {
    to,
    subject: `אישור הזמנה #${o.number} — ${o.storeName}`,
    text,
    html,
  };
}

export function orderStatusEmail(
  to: string,
  o: OrderMail,
  status: OrderStatus,
): EmailMessage {
  const label = STATUS_LABELS[status];
  return {
    to,
    subject: `עדכון להזמנה #${o.number}: ${label}`,
    text: `שלום ${o.customerName}, ההזמנה #${o.number} ב-${o.storeName} עודכנה: ${label}.`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif"><p>שלום ${esc(o.customerName)},</p><p>ההזמנה #${o.number} ב-${esc(o.storeName)} עודכנה: <strong>${esc(label)}</strong>.</p></div>`,
  };
}
