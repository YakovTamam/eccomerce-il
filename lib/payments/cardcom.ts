import { z } from "zod";
import { hostedPaymentInputSchema } from "./provider";
import type {
  HostedPaymentInput,
  PaymentEvent,
  PaymentProvider,
} from "./provider";

export type CardcomConfig = {
  terminalNumber: string;
  apiName: string;
  apiPassword: string;
  baseUrl: string;
  fetch?: typeof fetch;
};

const createResponse = z.object({
  ResponseCode: z.number(),
  Description: z.string().optional(),
  LowProfileId: z.string().optional(),
  Url: z.string().url().optional(),
});

const lpResultResponse = z.object({
  ResponseCode: z.number(),
  Description: z.string().optional(),
  LowProfileId: z.string().optional(),
  ReturnValue: z.string().optional(),
  TranzactionId: z.number().optional(),
  TranzactionInfo: z.object({ Amount: z.number() }).passthrough().optional(),
});

const webhookBody = z.object({ LowProfileId: z.string().min(1) }).passthrough();

const agorotToShekel = (agorot: number) => agorot / 100; // Cardcom takes decimal ILS; conversion happens only at this boundary.

/**
 * Cardcom LowProfile (hosted payment page), API v11.
 * Card details never reach our servers. Cardcom webhooks are not signed, so every
 * webhook is verified by fetching the result from Cardcom server-side (GetLpResult).
 * NOTE: endpoint/field names should be confirmed against the terminal's sandbox before go-live.
 */
export class CardcomPaymentProvider implements PaymentProvider {
  private f: typeof fetch;
  constructor(private cfg: CardcomConfig) {
    this.f = cfg.fetch ?? fetch;
  }

  private async post(path: string, body: Record<string, unknown>) {
    const res = await this.f(`${this.cfg.baseUrl}/api/v11/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        TerminalNumber: Number(this.cfg.terminalNumber),
        ApiName: this.cfg.apiName,
        ...body,
      }),
    });
    if (!res.ok) throw new Error(`Cardcom HTTP ${res.status}`);
    return res.json();
  }

  async createHostedPayment(rawInput: HostedPaymentInput) {
    const input = hostedPaymentInputSchema.parse(rawInput);
    const json = createResponse.parse(
      await this.post("LowProfile/Create", {
        Operation: "ChargeOnly",
        Amount: agorotToShekel(input.amountAgorot),
        ISOCoinId: 1,
        Language: "he",
        ReturnValue: input.orderId,
        SuccessRedirectUrl: input.successUrl,
        FailedRedirectUrl: input.cancelUrl,
        WebHookUrl: input.webhookUrl,
      }),
    );
    if (json.ResponseCode !== 0 || !json.Url || !json.LowProfileId) {
      throw new Error(
        `Cardcom create failed: ${json.Description ?? json.ResponseCode}`,
      );
    }
    return { url: json.Url, providerRef: json.LowProfileId };
  }

  async verifyWebhook(req: Request): Promise<PaymentEvent> {
    const { LowProfileId } = webhookBody.parse(await req.json());
    // Never trust the webhook body: confirm the result directly with Cardcom.
    const raw = await this.post("LowProfile/GetLpResult", { LowProfileId });
    const r = lpResultResponse.parse(raw);
    if (!r.ReturnValue) throw new Error("Cardcom result missing ReturnValue");
    return {
      providerRef: LowProfileId,
      orderId: r.ReturnValue,
      status: r.ResponseCode === 0 && r.TranzactionId ? "paid" : "failed",
      amountAgorot: Math.round((r.TranzactionInfo?.Amount ?? 0) * 100),
      raw,
    };
  }

  async refund(providerRef: string, amountAgorot: number) {
    const lp = lpResultResponse.parse(
      await this.post("LowProfile/GetLpResult", { LowProfileId: providerRef }),
    );
    if (!lp.TranzactionId) throw new Error("No transaction to refund");
    const res = z
      .object({ ResponseCode: z.number(), Description: z.string().optional() })
      .parse(
        await this.post("Transactions/RefundByTransactionId", {
          TransactionId: lp.TranzactionId,
          PartialSum: agorotToShekel(amountAgorot),
        }),
      );
    if (res.ResponseCode !== 0)
      throw new Error(
        `Cardcom refund failed: ${res.Description ?? res.ResponseCode}`,
      );
  }
}
