import { redirect } from "next/navigation";

export default async function StoreIndex({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/stores/${storeId}/products`);
}
