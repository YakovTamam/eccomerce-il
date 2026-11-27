import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";

/**
 * Fixed-window rate limiter backed by Postgres (works across serverless instances).
 * Returns true when the call is allowed.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  db: Db = getDb(),
): Promise<boolean> {
  const res = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count)
    values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}), 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  if (Math.random() < 0.01) {
    // opportunistic cleanup of old windows
    await db.execute(
      sql`delete from rate_limits where window_start < now() - interval '1 day'`,
    );
  }
  return Number(res.rows[0].count) <= limit;
}

/** Best-effort client IP behind a proxy/CDN (used only as a rate-limit key). */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
