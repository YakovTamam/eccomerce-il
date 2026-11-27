import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/storefront/add-to-cart";
import { MarkdownView } from "@/components/storefront/markdown-view";
import { getProductBySlug, getStorefrontStore } from "@/lib/storefront/data";
import { resolveStore } from "../../layout";

type P = { params: Promise<{ tenant: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { tenant, slug } = await params;
  const store = await getStorefrontStore(decodeURIComponent(tenant));
  const p = store && (await getProductBySlug(store.id, slug));
  if (!p) return { robots: { index: false } };
  const description =
    p.descriptionMd.replace(/[#*\[\]()>-]/g, "").slice(0, 160) || undefined;
  return {
    title: p.title,
    description,
    alternates: { canonical: `/products/${slug}` },
    openGraph: {
      title: p.title,
      description,
      url: `/products/${slug}`,
      images: p.images[0]
        ? [{ url: p.images[0].url, alt: p.images[0].alt }]
        : undefined,
    },
  };
}

async function Product({ params }: P) {
  const store = await resolveStore(params);
  const { slug } = await params;
  const p = await getProductBySlug(store.id, slug);
  if (!p) notFound();
  const prices = p.variants.map((v) => v.priceAgorot);
  const min = Math.min(...prices);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    image: p.images.map((i) => i.url),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "ILS",
      lowPrice: `${Math.trunc(min / 100)}.${String(min % 100).padStart(2, "0")}`,
      offerCount: p.variants.length,
      availability: p.variants.some((v) => v.inStock)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };
  return (
    <article className="grid gap-8 md:grid-cols-2">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="flex flex-col gap-3">
        {p.images.length === 0 && (
          <div
            className="aspect-square rounded-[var(--radius)] bg-[var(--surface)]"
            aria-hidden="true"
          />
        )}
        {p.images.map((im, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={im.url}
            src={im.url}
            alt={im.alt}
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
            className="w-full rounded-[var(--radius)] object-cover"
          />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold">{p.title}</h1>
        {p.descriptionMd && <MarkdownView source={p.descriptionMd} />}
        <AddToCart
          variants={p.variants.map((v) => ({
            id: v.id,
            title: v.title,
            priceAgorot: v.priceAgorot,
            inStock: v.inStock,
          }))}
        />
        <p className="text-neutral-700">המחירים כוללים מע״מ.</p>
      </div>
    </article>
  );
}

export default function Page({ params }: P) {
  return (
    <Suspense fallback={<p>טוען...</p>}>
      <Product params={params} />
    </Suspense>
  );
}
