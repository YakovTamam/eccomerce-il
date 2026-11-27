import { MockInvoiceProvider } from "./mock";
import type { InvoiceProvider } from "./provider";

export function getInvoiceProvider(
  env: Record<string, string | undefined> = process.env,
): InvoiceProvider {
  const name = env.INVOICE_PROVIDER ?? "mock";
  if (name === "mock") return new MockInvoiceProvider();
  // Real provider (Morning / iCount) is a founder decision (MVP_SPEC §15.2); fail loudly rather than silently skipping invoices.
  throw new Error(`INVOICE_PROVIDER "${name}" is not implemented`);
}
