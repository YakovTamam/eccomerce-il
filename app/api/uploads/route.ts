import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { isMemberOfStore } from "@/lib/tenancy/stores";
import { MAX_IMAGE_BYTES, saveImage, sniffImage } from "@/lib/storage/images";

const storeIdSchema = z.string().uuid();

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const storeId = storeIdSchema.safeParse(form?.get("storeId"));
  const file = form?.get("file");
  if (!storeId.success || !(file instanceof File))
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  if (!(await isMemberOfStore(session.user.id, storeId.data)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (file.size > MAX_IMAGE_BYTES)
    return NextResponse.json({ error: "too_large" }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind)
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });

  const url = await saveImage(storeId.data, bytes, kind);
  return NextResponse.json({ url });
}
