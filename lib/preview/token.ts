import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Signed, expiring preview tokens (MVP_SPEC §6). Reusable for drafts in Phase 5. */
const payloadSchema = z.object({
  s: z.string().uuid(),
  k: z.enum(["page"]),
  i: z.string().uuid(),
  e: z.number().int(),
});
export type PreviewPayload = { storeId: string; kind: "page"; id: string };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}
const sign = (data: string) =>
  createHmac("sha256", secret()).update(data).digest("base64url");

export function signPreviewToken(
  p: PreviewPayload,
  ttlSeconds = 3600,
  now = Date.now(),
): string {
  const body = Buffer.from(
    JSON.stringify({
      s: p.storeId,
      k: p.kind,
      i: p.id,
      e: Math.floor(now / 1000) + ttlSeconds,
    }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyPreviewToken(
  token: string,
  now = Date.now(),
): PreviewPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = payloadSchema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString()),
    );
    if (p.e < Math.floor(now / 1000)) return null;
    return { storeId: p.s, kind: p.k, id: p.i };
  } catch {
    return null;
  }
}
