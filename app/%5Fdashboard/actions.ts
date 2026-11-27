"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createStoreForUser, SlugTakenError } from "@/lib/tenancy/stores";
import { slugSchema } from "@/lib/tenancy/slug";

const createStoreSchema = z.object({
  name: z.string().trim().min(2, "נא להזין שם עסק").max(80),
  slug: slugSchema,
});

export type CreateStoreState = { error?: string };

export async function createStoreAction(
  _prev: CreateStoreState,
  formData: FormData,
): Promise<CreateStoreState> {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const parsed = createStoreSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await createStoreForUser(session.user.id, parsed.data);
  } catch (e) {
    if (e instanceof SlugTakenError)
      return { error: "הכתובת כבר תפוסה, נסו כתובת אחרת" };
    throw e;
  }
  redirect("/");
}
