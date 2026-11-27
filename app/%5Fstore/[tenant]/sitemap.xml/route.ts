import { connection } from "next/server";
import { getSitemapData, getStorefrontStore } from "@/lib/storefront/data";
import { storeBaseUrl } from "@/lib/storefront/urls";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  await connection(); // per-request: tenants are only known at runtime, never prerender
  const { tenant } = await params;
  const store = await getStorefrontStore(decodeURIComponent(tenant));
  if (!store) return new Response("Not found", { status: 404 });
  const base = storeBaseUrl(store);
  const d = await getSitemapData(store.id);
  const urls: { loc: string; lastmod?: Date }[] = [
    { loc: `${base}/` },
    ...d.categories.map((c) => ({ loc: `${base}/category/${c.slug}` })),
    ...d.products.map((p) => ({
      loc: `${base}/products/${p.slug}`,
      lastmod: new Date(p.updatedAt),
    })),
    ...d.pages
      .filter((p) => p.slug !== "home")
      .map((p) => ({
        loc: `${base}/pages/${p.slug}`,
        lastmod: new Date(p.updatedAt),
      })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ""}</url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;
  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
