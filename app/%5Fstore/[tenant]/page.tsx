import { Suspense } from "react";
import type { Metadata } from "next";
import { BlockRenderer } from "@/components/storefront/blocks/render";
import {
  getPublishedPageCached,
  getStorefrontStore,
} from "@/lib/storefront/data";
import { resolveStore } from "./layout";

type P = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { tenant } = await params;
  const store = await getStorefrontStore(decodeURIComponent(tenant));
  if (!store) return {};
  const page = await getPublishedPageCached(store.id, "home");
  const description = page?.seo.description;
  const title = page?.seo.title ?? store.name;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    openGraph: { title, description, url: "/" },
  };
}

async function Home({ params }: P) {
  const store = await resolveStore(params);
  const page = await getPublishedPageCached(store.id, "home");
  return (
    <>
      <h1 className="sr-only">{store.name}</h1>
      {page ? (
        <BlockRenderer storeId={store.id} blocks={page.blocks} />
      ) : (
        <BlockRenderer
          storeId={store.id}
          blocks={[
            {
              id: "default",
              type: "product_grid",
              heading: "המוצרים שלנו",
              source: { by: "all" },
              limit: 12,
            },
          ]}
        />
      )}
    </>
  );
}

export default function StoreHomePage({ params }: P) {
  return (
    <Suspense fallback={<p>טוען...</p>}>
      <Home params={params} />
    </Suspense>
  );
}
