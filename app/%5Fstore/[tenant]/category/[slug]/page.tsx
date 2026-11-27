import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/storefront/product-card";
import {
  getCategoryBySlug,
  getProductCards,
  getStorefrontStore,
} from "@/lib/storefront/data";
import { resolveStore } from "../../layout";

type P = { params: Promise<{ tenant: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { tenant, slug } = await params;
  const store = await getStorefrontStore(decodeURIComponent(tenant));
  const cat = store && (await getCategoryBySlug(store.id, slug));
  if (!cat) return { robots: { index: false } };
  return {
    title: cat.name,
    alternates: { canonical: `/category/${slug}` },
    openGraph: { title: cat.name, url: `/category/${slug}` },
  };
}

async function Category({ params }: P) {
  const store = await resolveStore(params);
  const { slug } = await params;
  const cat = await getCategoryBySlug(store.id, slug);
  if (!cat) notFound();
  const cards = await getProductCards(
    store.id,
    { by: "category", categoryId: cat.id },
    48,
  );
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{cat.name}</h1>
      {cards.length === 0 ? (
        <p>אין עדיין מוצרים בקטגוריה זו.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {cards.map((c) => (
            <ProductCard key={c.id} p={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Page({ params }: P) {
  return (
    <Suspense fallback={<p>טוען...</p>}>
      <Category params={params} />
    </Suspense>
  );
}
