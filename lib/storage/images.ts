import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { put } from "@vercel/blob";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Kind = { ext: string; mime: string };

/** Detect real type from magic bytes (never trust the client MIME / filename). SVG is not allowed. */
export function sniffImage(buf: Uint8Array): Kind | null {
  const b = (i: number) => buf[i];
  if (buf.length > 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff)
    return { ext: "jpg", mime: "image/jpeg" };
  if (
    buf.length > 8 &&
    b(0) === 0x89 &&
    b(1) === 0x50 &&
    b(2) === 0x4e &&
    b(3) === 0x47
  )
    return { ext: "png", mime: "image/png" };
  if (
    buf.length > 12 &&
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50
  )
    return { ext: "webp", mime: "image/webp" };
  if (buf.length > 6 && b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46)
    return { ext: "gif", mime: "image/gif" };
  return null;
}

/**
 * Stores an image under the store's prefix. Production: Vercel Blob.
 * Local dev without BLOB_READ_WRITE_TOKEN: public/uploads (git-ignored).
 */
export async function saveImage(
  storeId: string,
  bytes: Uint8Array,
  kind: Kind,
): Promise<string> {
  const name = `${randomBytes(8).toString("hex")}.${kind.ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`stores/${storeId}/${name}`, Buffer.from(bytes), {
      access: "public",
      contentType: kind.mime,
    });
    return blob.url;
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  const dir = path.join(process.cwd(), "public", "uploads", storeId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${storeId}/${name}`;
}
