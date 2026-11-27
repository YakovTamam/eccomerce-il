import { z } from "zod";

export const hostedPaymentInputSchema = z.object({
  orderId: z.string().min(1),
  amountAgorot: z.number().int().positive(),
  customer: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  webhookUrl: z.string().url(),
});
export type HostedPaymentInput = z.infer<typeof hostedPaymentInputSchema>;

export type PaymentEvent = {
  providerRef: string;
  orderId: string;
  status: "paid" | "failed";
  amountAgorot: number;
  raw: unknown;
};

export interface PaymentProvider {
  readonly name: "mock" | "cardcom";
  createHostedPayment(
    input: HostedPaymentInput,
  ): Promise<{ url: string; providerRef: string }>;
  /** Must verify authenticity; throws if the event cannot be verified. */
  verifyWebhook(req: Request): Promise<PaymentEvent>;
  refund(providerRef: string, amountAgorot: number): Promise<void>;
}
