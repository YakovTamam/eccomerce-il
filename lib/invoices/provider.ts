export type InvoiceOrder = {
  id: string;
  number: number;
  totalAgorot: number;
  vatRateBp: number;
  customer: { name: string; email: string | null; phone: string } | null;
  items: { title: string; qty: number; unitPriceAgorot: number }[];
};

export interface InvoiceProvider {
  readonly name: string;
  createInvoiceReceipt(
    order: InvoiceOrder,
  ): Promise<{ docId: string; url: string }>;
}
