import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNav, getStorefrontStore } from "@/lib/storefront/data";
import { storeBaseUrl } from "@/lib/storefront/urls";
import { themeCssVars } from "@/lib/theme/theme";
import { getCartView } from "@/lib/cart/service";
import { readCartId } from "@/lib/storefront/tenant";

type P = { params: Promise<{ tenant: string }> };

export async function resolveStore(params: P["params"]) {
  const { tenant } = await params;
  const store = await getStorefrontStore(decodeURIComponent(tenant));
  if (!store) notFound();
  return store;
}

async function CartLink({ storeId }: { storeId: string }) {
  const id = await readCartId();
  const cart = id ? await getCartView(storeId, id) : null;
  const n = cart?.itemCount ?? 0;
  return (
    <Link href="/cart" className="underline-offset-4 hover:underline">
      עגלה{n > 0 ? ` (${n})` : ""}
    </Link>
  );
}

async function Shell({ params, children }: P & { children: React.ReactNode }) {
  const store = await resolveStore(params);
  const nav = await getNav(store.id);
  return (
    <div
      className="store-root flex min-h-screen flex-col bg-white text-neutral-900"
      style={themeCssVars(store.theme) as React.CSSProperties}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:bg-white focus:p-3 focus:underline"
      >
        דלג לתוכן הראשי
      </a>
      <header className="bg-[var(--brand)] text-[var(--on-brand)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 p-4">
          <Link href="/" className="flex items-center gap-3 text-xl font-bold">
            {store.theme.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.theme.logoUrl} alt="" className="h-10 w-auto" />
            )}
            <span>{store.name}</span>
          </Link>
          <div className="flex flex-wrap items-center gap-6">
            {nav.length > 0 && (
              <nav aria-label="קטגוריות">
                <ul className="flex flex-wrap gap-4">
                  {nav.map((c) => (
                    <li key={c.slug}>
                      <a
                        href={`/category/${c.slug}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {c.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <Suspense fallback={<span>עגלה</span>}>
              <CartLink storeId={store.id} />
            </Suspense>
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 p-4 md:py-8"
      >
        {children}
      </main>
      <footer className="bg-[var(--surface)] p-6 text-center text-[var(--on-surface)]">
        <p>© {store.name}</p>
      </footer>
    </div>
  );
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { tenant } = await params;
  const store = await getStorefrontStore(decodeURIComponent(tenant));
  if (!store) return { robots: { index: false } };
  return {
    metadataBase: new URL(storeBaseUrl(store)),
    title: { default: store.name, template: `%s | ${store.name}` },
    openGraph: { siteName: store.name, locale: "he_IL", type: "website" },
  };
}

export default function StoreLayout({
  params,
  children,
}: P & { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8">טוען...</p>}>
      <Shell params={params}>{children}</Shell>
    </Suspense>
  );
}
