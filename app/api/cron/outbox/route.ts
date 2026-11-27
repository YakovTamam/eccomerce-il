import { timingSafeEqual } from "node:crypto";
import { runOutbox } from "@/lib/outbox/worker";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return Response.json({ error: "cron_not_configured" }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await runOutbox({ limit: 50 }));
}
