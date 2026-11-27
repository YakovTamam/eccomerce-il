import { getEnv } from "@/lib/env";
import { CardcomPaymentProvider } from "./cardcom";
import { MockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./provider";

export function appOrigin(
  source: Record<string, string | undefined> = process.env,
): string {
  return new URL(source.APP_URL ?? "http://app.localhost:3000").origin;
}

export function getPaymentProvider(
  source: Record<string, string | undefined> = process.env,
): PaymentProvider {
  const env = getEnv(source);
  if (env.PAYMENT_PROVIDER === "cardcom") {
    if (
      !env.CARDCOM_TERMINAL_NUMBER ||
      !env.CARDCOM_API_NAME ||
      !env.CARDCOM_API_PASSWORD
    ) {
      throw new Error(
        "Cardcom is selected but CARDCOM_* credentials are missing",
      );
    }
    return new CardcomPaymentProvider({
      terminalNumber: env.CARDCOM_TERMINAL_NUMBER,
      apiName: env.CARDCOM_API_NAME,
      apiPassword: env.CARDCOM_API_PASSWORD,
      baseUrl: env.CARDCOM_BASE_URL,
    });
  }
  // The mock "pays" without a card: never allow it to take real orders in production by accident.
  if (source.NODE_ENV === "production" && source.ALLOW_MOCK_PAYMENTS !== "1") {
    throw new Error(
      "PAYMENT_PROVIDER=mock is not allowed in production (set ALLOW_MOCK_PAYMENTS=1 for a demo store)",
    );
  }
  if (!source.AUTH_SECRET)
    throw new Error("AUTH_SECRET is required for the mock payment provider");
  return new MockPaymentProvider({
    secret: source.AUTH_SECRET,
    origin: appOrigin(source),
  });
}
