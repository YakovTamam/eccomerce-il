import { requireStoreAccess } from "@/lib/auth/access";
import { oauthUrls } from "@/lib/oauth/config";
import { listGrantsForStore } from "@/lib/oauth/service";
import { revokeConnectionAction } from "../draft-actions";

export const metadata = { title: "חיבור ל-Claude | איקומרס.ישראל" };

export default async function ClaudePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const grants = await listGrantsForStore(storeId);
  const url = oauthUrls().resource;
  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-bold">חיבור ל-Claude</h1>
      <section aria-labelledby="how" className="flex flex-col gap-2">
        <h2 id="how" className="text-xl font-semibold">
          איך מחברים
        </h2>
        <ol className="list-decimal ps-6">
          <li>
            ב-Claude: הגדרות ← מחברים (Connectors) ← הוספת מחבר מותאם אישית.
          </li>
          <li>
            הדביקו את כתובת השרת:{" "}
            <code
              dir="ltr"
              className="rounded bg-neutral-100 px-2 py-1 select-all"
            >
              {url}
            </code>
          </li>
          <li>
            תועברו למסך אישור כאן. בחרו את החנות ואת ההרשמה (קריאה / כתיבה)
            ואשרו.
          </li>
          <li>
            אחר כך אפשר לבקש מ-Claude, למשל: ״מה המכירות השבוע?״ או ״תכין דף
            נחיתה למבצע״.
          </li>
        </ol>
        <p className="text-neutral-700">
          שינויים בעמודים, מחירים, מוצרים וקופונים מוכנים כטיוטות ונכנסים לתוקף
          רק אחרי אישור (בשיחה או במסך הטיוטות). כל פעולה נרשמת ביומן השינויים.
        </p>
      </section>
      <section aria-labelledby="act" className="flex flex-col gap-2">
        <h2 id="act" className="text-xl font-semibold">
          חיבורים פעילים
        </h2>
        {grants.length === 0 ? (
          <p>אין חיבורים פעילים.</p>
        ) : (
          <table className="w-full">
            <caption className="sr-only">חיבורים פעילים</caption>
            <thead>
              <tr>
                {[
                  "אפליקציה",
                  "הרשאות",
                  "אושר על ידי",
                  "נוצר",
                  "שימוש אחרון",
                  "",
                ].map((h, i) => (
                  <th key={i} scope="col" className="p-2 text-start">
                    {h || <span className="sr-only">פעולות</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-t border-neutral-200">
                  <td className="p-2">{g.clientName}</td>
                  <td className="p-2">
                    {g.scopes
                      .map((s) => (s === "read" ? "קריאה" : "כתיבה"))
                      .join(", ")}
                  </td>
                  <td className="p-2">{g.userName}</td>
                  <td className="p-2">
                    {g.createdAt.toLocaleDateString("he-IL")}
                  </td>
                  <td className="p-2">
                    {g.lastUsedAt ? g.lastUsedAt.toLocaleString("he-IL") : "—"}
                  </td>
                  <td className="p-2">
                    <form action={revokeConnectionAction}>
                      <input type="hidden" name="storeId" value={storeId} />
                      <input type="hidden" name="grantId" value={g.id} />
                      <button
                        className="underline"
                        aria-label={`ביטול החיבור של ${g.clientName}`}
                      >
                        ביטול
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
