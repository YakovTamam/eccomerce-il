import type { MetadataRoute } from "next";

// Platform (marketing) site. Stores and the dashboard serve their own robots.txt via the proxy rewrite.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" } };
}
