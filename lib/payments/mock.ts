import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
  HostedPaymentInput,
  PaymentEvent,
  PaymentProvider,
} from "./provider";

const bodySchema = z.object({
  providerRef: z.string().min(1),
  orderId: z.string().min(1),
  amountAgorot: z.number().int().nonnegative(),
  status: z.enum(["paid", "failed"]),
});

export const mockSign = (secret: string, data: string) =>
  createHmac("sha256", secret).update(data).digest("hex");

export function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Development/test provider. Its "hosted page" is our own /api/mock-pay route and its webhooks are
 * HMAC-signed with AUTH_SECRET, so even the mock can't be forged by a stranger.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
  constructor(private cfg: { secret: string; origin: string }) {}

  async createHostedPayment(input: HostedPaymentInput) {
    const providerRef = `mock_${input.orderId.replace(/[^a-zA-Z0-9]/g, "")}`;
    const q = new URLSearchParams({
      ref: providerRef,
      order: input.orderId,
      amount: String(input.amountAgorot),
      success: input.successUrl,
      cancel: input.cancelUrl,
    });
    q.set("sig", mockSign(this.cfg.secret, q.toString()));
    return { url: `${this.cfg.origin}/api/mock-pay?${q}`, providerRef };
  }

  async verifyWebhook(req: Request): Promise<PaymentEvent> {
    const raw = await req.text();
    const sig = req.headers.get("x-mock-signature") ?? "";
    if (!safeEqualHex(sig, mockSign(this.cfg.secret, raw)))
      throw new Error("invalid mock signature");
    const body = bodySchema.parse(JSON.parse(raw));
    return { ...body, raw: body };
  }

  async refund() {}
}
