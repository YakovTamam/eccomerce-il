# 0005 — Checkout, payments, stock and the outbox

Status: accepted

## Prices are never taken from the client

Carts store only `{variantId, qty}`. Every view/checkout recomputes prices, stock, coupon validity and shipping from the DB (`buildCartView` + pure `computeTotals`, integer agorot, floor for percent discounts). The order snapshots prices, totals and the VAT rate (basis points).

## Order lifecycle

`pending_payment` → (verified payment) `paid` → preparing/ready/shipped/completed; `refunded` only through a real provider refund; `paid` only from a verified payment event (`lib/orders/status.ts`). A re-checkout of the same cart cancels earlier unpaid orders. Order numbers run per store via an atomic `store_counters` upsert.

## Payment webhook: verified + idempotent

1. The adapter verifies authenticity first (mock: HMAC-SHA256 with `AUTH_SECRET`; Cardcom: fetches the result from Cardcom server-side because its webhooks are unsigned).
2. `processPaymentEvent` runs in `withStore(storeId)` and locks the order row (`FOR UPDATE`). Only a `pending_payment → paid` transition has side effects (stock, coupon usage, cart conversion, outbox jobs). Replays/concurrent duplicates are no-ops (tested with 4 parallel calls → exactly one `paid`).
3. The provider only sees an opaque `"<storeId>:<orderId>"`, so the webhook finds the tenant without any cross-store lookup; the amount must equal the order total or the order is NOT marked paid.
4. `payments(provider, provider_ref)` is unique.
   The mock provider refuses to run in production unless `ALLOW_MOCK_PAYMENTS=1`.

## Stock

Checked at add-to-cart and checkout; decremented at payment time (spec §7). If stock ran out between checkout and payment, the paid order is kept, stock is clamped at 0 and the order is flagged in its notes for manual handling (money is already taken). Refund restocks tracked variants. Coupon `used_count` increments on payment; the limit is checked at apply/checkout (small over-use window under concurrency is accepted for MVP).

## Outbox

Transactional outbox (`outbox_jobs`, unique `(store_id, dedupe_key)`): jobs are inserted in the same transaction as the payment. `runOutbox` claims due jobs with a short lease (`FOR UPDATE SKIP LOCKED`), retries with backoff, max 5 attempts. It runs right after a payment (`after()`) and from `GET /api/cron/outbox` (Bearer `CRON_SECRET`). **Vercel Hobby cannot run per-minute crons**; use Vercel Pro or an external pinger for the safety net.
Jobs: `create_invoice` (one invoice per order, enforced by a unique constraint), `send_order_email`, `send_status_email`. Email: Resend if `RESEND_API_KEY`, else a console provider.

## Platform vs tenant access

The outbox worker's claim/ack uses the owner connection (platform concern); each job's business work runs through `withStore`. Variants are referenced from `order_items` by id without an FK (the order keeps its own snapshot), so deleting catalog rows can never corrupt past orders.
