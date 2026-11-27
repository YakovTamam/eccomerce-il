import { after } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { processPaymentEvent } from "@/lib/orders/payments";
import { runOutbox } from "@/lib/outbox/worker";
import { invalidateStoreFromRoute } from "@/lib/storefront/revalidate";

/**
 * Payment webhook. The provider adapter VERIFIES authenticity first (HMAC for the mock, a server-side
 * result fetch for Cardcom, whose webhooks are unsigned); only then is the event applied, idempotently.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: name } = await params;
  let provider;
  try {
    provider = getPaymentProvider();
  } catch {
    return Response.json({ error: "payments_unavailable" }, { status: 503 });
  }
  if (provider.name !== name)
    return Response.json({ error: "unknown_provider" }, { status: 404 });

  let event;
  try {
    event = await provider.verifyWebhook(req);
  } catch {
    return Response.json({ error: "invalid_webhook" }, { status: 400 });
  }

  const result = await processPaymentEvent(provider.name, event);
  if (result.status === "paid") {
    invalidateStoreFromRoute(result.storeId); // stock changed: refresh cached storefront
    after(() => runOutbox().catch((e) => console.error("outbox failed", e)));
  }
  // Always 200 for handled/duplicate events so the provider stops retrying.
  return Response.json({ status: result.status });
}
