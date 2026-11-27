import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/**
 * Platform admins are users with users.platform_role = 'admin', granted out-of-band
 * (`pnpm admin:grant <email>`). Email allow-lists are deliberately NOT used: without email
 * verification anyone could register an admin's address first.
 */
export async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=%2Fadmin");
  const [u] = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.platformRole,
    })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (u?.role !== "admin") notFound(); // do not reveal that an admin area exists
  return { id: u.id, name: u.name, email: u.email };
}
