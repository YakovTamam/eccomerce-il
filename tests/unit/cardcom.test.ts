import { describe, expect, it, vi } from "vitest";
import { CardcomPaymentProvider } from "@/lib/payments/cardcom";
import { getPaymentProvider } from "@/lib/payments";

const input = {
  orderId: "o1",
  amountAgorot: 12350,
  customer: {},
  successUrl: "https://a.example/ok",
  cancelUrl: "https://a.example/no",
  webhookUrl: "https://a.example/hook",
};
const make = (fetchImpl: typeof fetch) =>
  new CardcomPaymentProvider({
    terminalNumber: "1000",
    apiName: "api",
    apiPassword: "pw",
    baseUrl: "https://c.test",
    fetch: fetchImpl,
  });
const json = (b: unknown) => new Response(JSON.stringify(b));

describe("CardcomPaymentProvider", () => {
  it("creates a hosted payment, converting agorot to ILS only at the boundary", async () => {
    const f = vi.fn().mockResolvedValue(
      json({
        ResponseCode: 0,
        LowProfileId: "lp1",
        Url: "https://pay.test/lp1",
      }),
    );
    const res = await make(f).createHostedPayment(input);
    expect(res).toEqual({ url: "https://pay.test/lp1", providerRef: "lp1" });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.Amount).toBe(123.5);
    expect(body.ReturnValue).toBe("o1");
  });

  it("rejects non-integer amounts", async () => {
    await expect(
      make(vi.fn()).createHostedPayment({ ...input, amountAgorot: 10.5 }),
    ).rejects.toThrow();
  });

  it("verifies webhook by re-fetching the result from Cardcom, not trusting the body", async () => {
    const f = vi.fn().mockResolvedValue(
      json({
        ResponseCode: 0,
        ReturnValue: "o1",
        TranzactionId: 77,
        TranzactionInfo: { Amount: 123.5 },
      }),
    );
    const ev = await make(f).verifyWebhook(
      new Request("https://x", {
        method: "POST",
        body: JSON.stringify({ LowProfileId: "lp1", ReturnValue: "evil" }),
      }),
    );
    expect(ev).toMatchObject({
      providerRef: "lp1",
      orderId: "o1",
      status: "paid",
      amountAgorot: 12350,
    });
  });

  it("marks failed payments", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(json({ ResponseCode: 5, ReturnValue: "o1" }));
    const ev = await make(f).verifyWebhook(
      new Request("https://x", {
        method: "POST",
        body: JSON.stringify({ LowProfileId: "lp1" }),
      }),
    );
    expect(ev.status).toBe("failed");
  });
});

describe("getPaymentProvider", () => {
  it("defaults to mock (needs AUTH_SECRET)", () => {
    expect(getPaymentProvider({ AUTH_SECRET: "s" }).constructor.name).toBe(
      "MockPaymentProvider",
    );
    expect(() => getPaymentProvider({})).toThrow(/AUTH_SECRET/);
  });
  it("refuses the mock in production unless explicitly allowed", () => {
    expect(() =>
      getPaymentProvider({ NODE_ENV: "production", AUTH_SECRET: "s" }),
    ).toThrow(/not allowed in production/);
    expect(
      getPaymentProvider({
        NODE_ENV: "production",
        AUTH_SECRET: "s",
        ALLOW_MOCK_PAYMENTS: "1",
      }).name,
    ).toBe("mock");
  });
  it("requires credentials for cardcom", () => {
    expect(() => getPaymentProvider({ PAYMENT_PROVIDER: "cardcom" })).toThrow(
      /credentials/,
    );
  });
});
