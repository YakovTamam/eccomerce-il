import { getEnv } from "@/lib/env";
import { CardcomPaymentProvider } from "./cardcom";
import { MockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./provider";

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
  return new MockPaymentProvider();
}
