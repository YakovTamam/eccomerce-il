import type { InvoiceOrder, InvoiceProvider } from "./provider";

export class MockInvoiceProvider implements InvoiceProvider {
  readonly name = "mock";
  async createInvoiceReceipt(order: InvoiceOrder) {
    return {
      docId: `MOCK-${order.number}`,
      url: `https://invoices.mock.invalid/${order.id}`,
    };
  }
}
