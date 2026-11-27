import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStoreAccess } from "@/lib/auth/access";
import { agorotToInput } from "@/lib/catalog/money";
import { getProduct, listCategories } from "@/lib/catalog/service";
import {
  ProductForm,
  type ProductFormValues,
} from "@/components/dashboard/product-form";

export const metadata = { title: "עריכת מוצר | איקומרס.ישראל" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ storeId: string; productId: string }>;
}) {
  const { storeId, productId } = await params;
  await requireStoreAccess(storeId);
  if (!z.string().uuid().safeParse(productId).success) notFound();
  const [product, categories] = await Promise.all([
    getProduct(storeId, productId),
    listCategories(storeId),
  ]);
  if (!product) notFound();

  const initial: ProductFormValues = {
    title: product.title,
    descriptionMd: product.descriptionMd,
    status: product.status,
    categoryId: product.categoryId ?? "",
    images: product.images,
    variants: product.variants.map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku ?? "",
      size: v.options.size ?? "",
      color: v.options.color ?? "",
      price: agorotToInput(v.priceAgorot),
      compareAt:
        v.compareAtAgorot === null ? "" : agorotToInput(v.compareAtAgorot),
      stockQty: String(v.stockQty),
      trackStock: v.trackStock,
    })),
  };
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">עריכת מוצר</h1>
      <ProductForm
        storeId={storeId}
        productId={productId}
        initial={initial}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </main>
  );
}
