import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const randomToken = (prefix: string, bytes = 32) =>
  `${prefix}_${randomBytes(bytes).toString("base64url")}`;
export const sha256Hex = (s: string) =>
  createHash("sha256").update(s).digest("hex");

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) */
export const pkceChallenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false; // RFC 7636 §4.1
  const a = Buffer.from(pkceChallenge(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
