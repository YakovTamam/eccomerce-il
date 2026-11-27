import { updateTag } from "next/cache";

/** Call from Server Actions after any change that affects the public storefront. */
export function invalidateStore(storeId: string) {
  updateTag(`store:${storeId}`);
}
export function invalidateProduct(productId: string) {
  updateTag(`product:${productId}`);
}
