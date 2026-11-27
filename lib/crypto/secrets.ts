import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts secrets at rest (e.g. WhatsApp access tokens) with AES-256-GCM.
 * ENCRYPTION_KEY = 32 random bytes, base64 (`openssl rand -base64 32`).
 * Format: v1:<iv>:<tag>:<ciphertext> (all base64url). Tampering fails authentication.
 */
function key(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32)
    throw new Error("ENCRYPTION_KEY must be 32 bytes (base64)");
  return k;
}

export function encryptSecret(
  plain: string,
  env?: Record<string, string | undefined>,
): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(env), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    enc.toString("base64url"),
  ].join(":");
}

export function decryptSecret(
  blob: string,
  env?: Record<string, string | undefined>,
): string {
  const [v, iv, tag, data] = blob.split(":");
  if (v !== "v1" || !iv || !tag || !data)
    throw new Error("unsupported secret format");
  const d = createDecipheriv(
    "aes-256-gcm",
    key(env),
    Buffer.from(iv, "base64url"),
  );
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    d.update(Buffer.from(data, "base64url")),
    d.final(),
  ]).toString("utf8");
}
