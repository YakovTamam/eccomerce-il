import { after } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { mockSign, safeEqualHex } from "@/lib/payments/mock";
import { processPaymentEvent } from "@/lib/orders/payments";
import { formatAgorot } from "@/lib/catalog/money";
import { runOutbox } from "@/lib/outbox/worker";
import { invalidateStoreFromRoute } from "@/lib/storefront/revalidate";

/** Stand-in for a provider's hosted payment page (PAYMENT_PROVIDER=mock). All parameters are HMAC-signed. */

const KEYS = ["ref", "order", "amount", "success", "cancel"] as const;
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function verify(params: URLSearchParams) {
  const provider = getPaymentProvider();
  if (provider.name !== "mock") return null;
  const q = new URLSearchParams();
  for (const k of KEYS) q.set(k, params.get(k) ?? "");
  const secret = process.env.AUTH_SECRET ?? "";
  if (!safeEqualHex(params.get("sig") ?? "", mockSign(secret, q.toString())))
    return null;
  const amount = Number(q.get("amount"));
  if (!Number.isInteger(amount) || amount < 0) return null;
  return {
    ref: q.get("ref")!,
    order: q.get("order")!,
    amount,
    success: q.get("success")!,
    cancel: q.get("cancel")!,
  };
}

export async function GET(req: Request) {
  let p;
  try {
    p = verify(new URL(req.url).searchParams);
  } catch {
    p = null;
  }
  if (!p) return new Response("Invalid payment link", { status: 400 });
  const hidden = [...new URL(req.url).searchParams]
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>תשלום (סימולציה)</title>
<style>body{font-family:Arial,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem}button{font-size:1rem;padding:.7rem 1.2rem;margin-inline-end:.5rem;cursor:pointer}</style></head>
<body><main><h1>דף תשלום מאובטח (סימולציה)</h1><p>סכום לתשלום: <strong>${formatAgorot(p.amount)}</strong></p>
<p>זהו ספק תשלום מדומה לפיתוח. לא מוזנים פרטי אשראי.</p>
<form method="post">${hidden}<button name="action" value="pay">שלם עכשיו</button><button name="action" value="cancel">ביטול</button></form></main></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const params = new URLSearchParams();
  for (const [k, v] of form) if (typeof v === "string") params.set(k, v);
  let p;
  try {
    p = verify(params);
  } catch {
    p = null;
  }
  if (!p) return new Response("Invalid payment link", { status: 400 });

  if (params.get("action") === "pay") {
    const result = await processPaymentEvent("mock", {
      providerRef: p.ref,
      orderId: p.order,
      amountAgorot: p.amount,
      status: "paid",
      raw: { source: "mock-pay" },
    });
    if (result.status === "paid") {
      invalidateStoreFromRoute(result.storeId); // stock changed: refresh cached storefront
      after(() => runOutbox().catch((e) => console.error("outbox failed", e)));
    }
    return Response.redirect(p.success, 303);
  }
  return Response.redirect(p.cancel, 303);
}
