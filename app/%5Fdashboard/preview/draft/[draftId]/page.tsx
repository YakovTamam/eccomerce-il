import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { BlockRenderer } from "@/components/storefront/blocks/render";
import { stores } from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";
import { getDraft } from "@/lib/drafts/service";
import { pagePayloadSchema } from "@/lib/drafts/schemas";
import { verifyPreviewToken } from "@/lib/preview/token";
import { readTheme, themeCssVars } from "@/lib/theme/theme";

export const metadata: Metadata = {
  title: "תצוגה מקדימה",
  robots: { index: false, follow: false },
};

type P = {
  params: Promise<{ draftId: string }>;
  searchParams: Promise<{ t?: string }>;
};

async function Preview({ params, searchParams }: P) {
  await connection(); // token expiry uses the clock: request-time only
  const { draftId } = await params;
  const { t } = await searchParams;
  const claims = t ? verifyPreviewToken(t) : null;
  if (!claims || claims.kind !== "draft" || claims.id !== draftId) notFound();

  const d = await getDraft(claims.storeId, draftId);
  if (!d || d.kind !== "page") notFound();
  const payload = pagePayloadSchema.parse(d.payload);
  const [store] = await withStore(claims.storeId, (tx) =>
    tx.select().from(stores).where(eq(stores.id, claims.storeId)),
  );
  return (
    <div
      className="store-root min-h-screen bg-white"
      style={themeCssVars(readTheme(store?.settings)) as React.CSSProperties}
    >
      <p role="status" className="bg-yellow-200 p-2 text-center text-black">
        תצוגה מקדימה של טיוטה — לא פורסמה (
        {d.effectiveStatus === "pending" ? "ממתינה לאישור" : d.effectiveStatus})
      </p>
      <main id="main" className="mx-auto w-full max-w-6xl p-4 md:py-8">
        <h1 className="sr-only">{payload.input.title}</h1>
        <BlockRenderer storeId={claims.storeId} blocks={payload.input.blocks} />
      </main>
    </div>
  );
}

export default function DraftPreviewPage(props: P) {
  return (
    <Suspense fallback={<p className="p-6">טוען...</p>}>
      <Preview {...props} />
    </Suspense>
  );
}
