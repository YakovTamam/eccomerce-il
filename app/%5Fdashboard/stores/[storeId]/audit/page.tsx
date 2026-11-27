import { desc } from "drizzle-orm";
import { requireStoreAccess } from "@/lib/auth/access";
import { auditLog } from "@/lib/db/schema";
import { withStore } from "@/lib/db/with-store";

export const metadata = { title: "יומן שינויים | איקומרס.ישראל" };

const ACTOR = {
  user: "משתמש",
  mcp: "Claude (MCP)",
  ai_agent: "סוכן AI",
  system: "מערכת",
} as const;

export default async function AuditPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireStoreAccess(storeId);
  const rows = await withStore(storeId, (tx) =>
    tx.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200),
  );
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">יומן שינויים</h1>
      {rows.length === 0 ? (
        <p>אין עדיין רשומות.</p>
      ) : (
        <table className="w-full">
          <caption className="sr-only">יומן שינויים</caption>
          <thead>
            <tr>
              {["זמן", "מבצע", "פעולה", "ישות", "פרטים"].map((h) => (
                <th key={h} scope="col" className="p-2 text-start">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200 align-top">
                <td className="p-2">{r.createdAt.toLocaleString("he-IL")}</td>
                <td className="p-2">{ACTOR[r.actorType]}</td>
                <td className="p-2" dir="ltr">
                  {r.action}
                </td>
                <td className="p-2" dir="ltr">
                  {r.entity}
                </td>
                <td className="p-2 text-sm" dir="ltr">
                  {r.after ? (
                    <code>{JSON.stringify(r.after).slice(0, 200)}</code>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
