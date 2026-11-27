import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatAgorot } from "@/lib/catalog/money";
import { getCartView } from "@/lib/cart/service";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { currentStore, readCartId } from "@/lib/storefront/tenant";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "תשלום", robots: { index: false } };
}

async function Checkout() {
  const store = await currentStore();
  const cartId = await readCartId();
  const cart = cartId ? await getCartView(store.id, cartId) : null;
  if (!cart || cart.lines.length === 0 || cart.issues.length > 0)
    redirect("/cart");
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">פרטים ותשלום</h1>
      <p>
        סה״כ לתשלום: <strong>{formatAgorot(cart.totals.totalAgorot)}</strong>{" "}
        (כולל מע״מ) ·{" "}
        <a href="/cart" className="underline">
          חזרה לעגלה
        </a>
      </p>
      <CheckoutForm
        shippingMethod={cart.shippingMethod}
        pickupAddress={cart.shippingSettings.pickupAddress}
      />
    </section>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<p>טוען...</p>}>
      <Checkout />
    </Suspense>
  );
}
