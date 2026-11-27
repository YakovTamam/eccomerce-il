import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";

const env = { ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };

describe("secrets (AES-256-GCM)", () => {
  it("round-trips and never stores plaintext", () => {
    const blob = encryptSecret("EAAG-whatsapp-token", env);
    expect(blob.startsWith("v1:")).toBe(true);
    expect(blob).not.toContain("EAAG");
    expect(decryptSecret(blob, env)).toBe("EAAG-whatsapp-token");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptSecret("x", env)).not.toBe(encryptSecret("x", env));
  });
  it("fails on tampering, wrong key, and bad key sizes", () => {
    const blob = encryptSecret("secret", env);
    const parts = blob.split(":");
    parts[3] = parts[3].replace(/.$/, parts[3].endsWith("A") ? "B" : "A");
    expect(() => decryptSecret(parts.join(":"), env)).toThrow();
    expect(() =>
      decryptSecret(blob, {
        ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      }),
    ).toThrow();
    expect(() => encryptSecret("x", { ENCRYPTION_KEY: "short" })).toThrow(
      /32 bytes/,
    );
    expect(() => encryptSecret("x", {})).toThrow(/not set/);
    expect(() => decryptSecret("garbage", env)).toThrow();
  });
});
