"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStoreAccess } from "@/lib/auth/access";
import {
  invalidateProduct,
  invalidateStore,
} from "@/lib/storefront/revalidate";
import { parseProductForm, categorySchema } from "@/lib/catalog/schemas";
import {
  createCategory,
  createProduct,
  deleteCategory,
  InvalidReferenceError,
  updateProduct,
} from "@/lib/catalog/service";

export type FormState = { error?: string };

const idSchema = z.string().uuid();

export async function saveProductAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const storeId = String(formData.get("storeId") ?? "");
  await requireStoreAccess(storeId);

  const productIdRaw = String(formData.get("productId") ?? "");
  const productId = productIdRaw ? idSchema.safeParse(productIdRaw) : null;
  if (productId && !productId.success) return { error: "מוצר לא תקין" };

  const parsed = parseProductForm(formData.get("payload"));
  if (!parsed.ok) return { error: parsed.error };

  try {
    if (productId?.success) {
      await updateProduct(storeId, productId.data, parsed.data);
      invalidateProduct(productId.data);
    } else {
      await createProduct(storeId, parsed.data);
    }
    invalidateStore(storeId);
  } catch (e) {
    if (e instanceof InvalidReferenceError)
      return { error: "הקטגוריה שנבחרה לא קיימת" };
    if (
      e instanceof Error &&
      /product_variants_store_sku_uq/.test(
        String((e as { cause?: unknown }).cause ?? e.message),
      )
    )
      return { error: 'מק"ט כבר קיים במוצר אחר' };
    throw e;
  }
  redirect(`/stores/${storeId}/products`);
}

export async function createCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const storeId = String(formData.get("storeId") ?? "");
  await requireStoreAccess(storeId);
  const parsed = categorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await createCategory(storeId, parsed.data.name);
  invalidateStore(storeId);
  redirect(`/stores/${storeId}/categories`);
}

export async function deleteCategoryAction(formData: FormData) {
  const storeId = String(formData.get("storeId") ?? "");
  await requireStoreAccess(storeId);
  const id = idSchema.safeParse(formData.get("categoryId"));
  if (!id.success) return;
  await deleteCategory(storeId, id.data);
  invalidateStore(storeId);
  redirect(`/stores/${storeId}/categories`);
}
