import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlockRenderer } from "@/components/storefront/blocks/render";
import {
  getPublishedPageCached,
  getStorefrontStore,
} from "@/lib/storefront/data";
import { resolveStore } from "../../layout";

type P = { params: Promise<{ tenant: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { tenant, slug } = await params;
  const store = await getStorefrontStore(decodeURIComponent(tenant));
  const page = store && (await getPublishedPageCached(store.id, slug));
  if (!page) return { robots: { index: false } };
  const title = page.seo.title ?? page.title;
  return {
    title,
    description: page.seo.description,
    alternates: { canonical: `/pages/${slug}` },
    openGraph: {
      title,
      description: page.seo.description,
      url: `/pages/${slug}`,
    },
  };
}

async function CustomPage({ params }: P) {
  const store = await resolveStore(params);
  const { slug } = await params;
  const page = await getPublishedPageCached(store.id, slug);
  if (!page) notFound();
  return (
    <>
      <h1 className="sr-only">{page.title}</h1>
      <BlockRenderer storeId={store.id} blocks={page.blocks} />
    </>
  );
}

export default function Page({ params }: P) {
  return (
    <Suspense fallback={<p>טוען...</p>}>
      <CustomPage params={params} />
    </Suspense>
  );
}
