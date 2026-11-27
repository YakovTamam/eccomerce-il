import type {
  HostedPaymentInput,
  PaymentEvent,
  PaymentProvider,
} from "./provider";

export class MockPaymentProvider implements PaymentProvider {
  async createHostedPayment(input: HostedPaymentInput) {
    const providerRef = `mock_${input.orderId}`;
    return {
      url: `${input.successUrl}?mock=1&ref=${providerRef}`,
      providerRef,
    };
  }
  async verifyWebhook(req: Request): Promise<PaymentEvent> {
    const body = (await req.json()) as {
      providerRef: string;
      orderId: string;
      amountAgorot: number;
    };
    return { ...body, status: "paid", raw: body };
  }
  async refund() {}
}
