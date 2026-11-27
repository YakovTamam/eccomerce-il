import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { formatAgorot } from "@/lib/catalog/money";
import { getCartView } from "@/lib/cart/service";
import { vatIncluded, vatRateToBp } from "@/lib/cart/pricing";
import { CouponForm } from "@/components/storefront/coupon-form";
import { currentStore, readCartId } from "@/lib/storefront/tenant";
import {
  removeCouponAction,
  setShippingAction,
  updateQtyAction,
} from "./actions";

export const metadata: Metadata = {
  title: "עגלת קניות",
  robots: { index: false },
};

const row = "flex justify-between gap-4";

async function Cart() {
  const store = await currentStore();
  const cartId = await readCartId();
  const cart = cartId ? await getCartView(store.id, cartId) : null;

  if (!cart || cart.lines.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold">עגלת קניות</h1>
        <p>העגלה ריקה.</p>
        <Link href="/" className="underline">
          להמשך קנייה
        </Link>
      </section>
    );
  }
  const t = cart.totals;
  const s = cart.shippingSettings;
  const vat = vatIncluded(t.totalAgorot, vatRateToBp("0.18"));

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">עגלת קניות</h1>

      {cart.issues.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-red-700 p-3 text-red-800"
        >
          <ul>
            {cart.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <ul className="flex flex-col gap-4">
        {cart.lines.map((l) => (
          <li
            key={l.variantId}
            className="flex flex-wrap items-center gap-4 border-b border-neutral-300 pb-4"
          >
            {l.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={l.imageUrl}
                alt={l.imageAlt ?? ""}
                className="size-20 rounded-[var(--radius)] object-cover"
              />
            )}
            <div className="min-w-40 flex-1">
              <a
                href={`/products/${l.productSlug}`}
                className="font-semibold underline"
              >
                {l.productTitle}
              </a>
              <p>{l.variantTitle}</p>
              <p>{formatAgorot(l.unitPriceAgorot)} ליחידה</p>
            </div>
            <form action={updateQtyAction} className="flex items-end gap-2">
              <input type="hidden" name="variantId" value={l.variantId} />
              <label className="flex flex-col gap-1">
                כמות
                <input
                  type="number"
                  name="qty"
                  min={0}
                  max={99}
                  defaultValue={l.qty}
                  className="w-20 rounded-md border border-neutral-500 px-2 py-1"
                />
              </label>
              <button
                className="underline"
                aria-label={`עדכון: ${l.productTitle}`}
              >
                עדכון
              </button>
            </form>
            <form action={updateQtyAction}>
              <input type="hidden" name="variantId" value={l.variantId} />
              <input type="hidden" name="qty" value="0" />
              <button
                className="underline"
                aria-label={`הסרה: ${l.productTitle}`}
              >
                הסרה
              </button>
            </form>
            <strong>{formatAgorot(l.lineTotalAgorot)}</strong>
          </li>
        ))}
      </ul>

      <form action={setShippingAction} className="flex flex-col gap-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xl font-semibold">שיטת קבלה</legend>
          {s.pickupEnabled && (
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="shippingMethod"
                value="pickup"
                defaultChecked={cart.shippingMethod === "pickup"}
              />
              איסוף עצמי{s.pickupAddress ? ` (${s.pickupAddress})` : ""} — חינם
            </label>
          )}
          {s.deliveryEnabled && (
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="shippingMethod"
                value="delivery"
                defaultChecked={cart.shippingMethod === "delivery"}
              />
              משלוח — {formatAgorot(s.flatRateAgorot)}
              {s.freeOverAgorot !== null &&
                ` (חינם מעל ${formatAgorot(s.freeOverAgorot)})`}
            </label>
          )}
        </fieldset>
        <button className="self-start underline">עדכון שיטת קבלה</button>
      </form>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          {cart.discount ? (
            <form
              action={removeCouponAction}
              className="flex items-center gap-3"
            >
              <p>
                קופון <strong dir="ltr">{cart.discount.code}</strong> הוחל
              </p>
              <button className="underline">הסרה</button>
            </form>
          ) : (
            <>
              {cart.discountMessage && (
                <p role="alert" className="text-red-700">
                  {cart.discountMessage}
                </p>
              )}
              <CouponForm />
            </>
          )}
        </div>
        <dl className="flex flex-col gap-2">
          <div className={row}>
            <dt>סכום ביניים</dt>
            <dd>{formatAgorot(t.subtotalAgorot)}</dd>
          </div>
          {t.discountAgorot > 0 && (
            <div className={row}>
              <dt>הנחה</dt>
              <dd>-{formatAgorot(t.discountAgorot)}</dd>
            </div>
          )}
          <div className={row}>
            <dt>משלוח</dt>
            <dd>
              {t.shippingAgorot === 0 ? "חינם" : formatAgorot(t.shippingAgorot)}
            </dd>
          </div>
          <div
            className={`${row} border-t border-neutral-400 pt-2 text-xl font-bold`}
          >
            <dt>סה״כ לתשלום</dt>
            <dd>{formatAgorot(t.totalAgorot)}</dd>
          </div>
        </dl>
        <p className="text-neutral-700">כולל מע״מ ({formatAgorot(vat)})</p>
      </div>

      {cart.issues.length === 0 ? (
        <a
          href="/checkout"
          className="self-start rounded-[var(--radius)] bg-[var(--brand)] px-6 py-3 font-semibold text-[var(--on-brand)]"
        >
          המשך לתשלום
        </a>
      ) : (
        <p className="font-semibold">יש לעדכן את העגלה לפני המשך לתשלום.</p>
      )}
    </section>
  );
}

export default function CartPage() {
  return (
    <Suspense fallback={<p>טוען...</p>}>
      <Cart />
    </Suspense>
  );
}
