import { connection } from "next/server";
import { getStorefrontStore } from "@/lib/storefront/data";
import { storeBaseUrl } from "@/lib/storefront/urls";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  await connection(); // per-request: tenants are only known at runtime, never prerender
  const { tenant } = await params;
  const store = await getStorefrontStore(decodeURIComponent(tenant));
  if (!store) return new Response("Not found", { status: 404 });
  return new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${storeBaseUrl(store)}/sitemap.xml\n`,
    {
      headers: { "content-type": "text/plain; charset=utf-8" },
    },
  );
}
