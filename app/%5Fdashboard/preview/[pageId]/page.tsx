import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { BlockRenderer } from "@/components/storefront/blocks/render";
import { stores } from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import { getPage, parseStoredBlocks } from "@/lib/pages/service";
import { verifyPreviewToken } from "@/lib/preview/token";
import { readTheme, themeCssVars } from "@/lib/theme/theme";

export const metadata: Metadata = {
  title: "תצוגה מקדימה",
  robots: { index: false, follow: false },
};

type P = {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ t?: string }>;
};

async function Preview({ params, searchParams }: P) {
  await connection(); // token expiry uses the clock: request-time only
  const { pageId } = await params;
  const { t } = await searchParams;
  // Signed + expiring token (no session needed so the link can be shared briefly).
  const claims = t ? verifyPreviewToken(t) : null;
  if (!claims || claims.kind !== "page" || claims.id !== pageId) notFound();

  const page = await getPage(claims.storeId, pageId);
  if (!page) notFound();
  const [store] = await withStore(claims.storeId, (tx) =>
    tx.select().from(stores).where(eq(stores.id, claims.storeId)),
  );
  const theme = readTheme(store?.settings);
  return (
    <div
      className="store-root min-h-screen bg-white"
      style={themeCssVars(theme) as React.CSSProperties}
    >
      <p role="status" className="bg-yellow-200 p-2 text-center text-black">
        תצוגה מקדימה של הטיוטה — העמוד אינו מפורסם בהכרח
      </p>
      <main id="main" className="mx-auto w-full max-w-6xl p-4 md:py-8">
        <h1 className="sr-only">{page.title}</h1>
        <BlockRenderer
          storeId={claims.storeId}
          blocks={parseStoredBlocks(page.blocks)}
        />
      </main>
    </div>
  );
}

export default function PreviewPage(props: P) {
  return (
    <Suspense fallback={<p className="p-6">טוען...</p>}>
      <Preview {...props} />
    </Suspense>
  );
}
