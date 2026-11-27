"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { callbackUrl, checkAuthorizeRequest } from "@/lib/oauth/authorize";
import { createAuthorizationCode, OAuthError } from "@/lib/oauth/service";
import type { Scope } from "@/lib/oauth/config";

export type ConsentState = { error?: string };

const FIELDS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "code_challenge",
  "code_challenge_method",
  "scope",
  "state",
  "resource",
] as const;

export async function consentAction(
  _p: ConsentState,
  fd: FormData,
): Promise<ConsentState> {
  const session = await getSession();
  if (!session) return { error: "פג תוקף ההתחברות. התחברו מחדש." };

  const params = Object.fromEntries(
    FIELDS.map((k) => [
      k,
      typeof fd.get(k) === "string" ? (fd.get(k) as string) : undefined,
    ]),
  );
  const check = await checkAuthorizeRequest(params);
  if (!check.ok)
    return { error: "הבקשה אינה תקינה. התחילו את החיבור מחדש מתוך Claude." };

  if (fd.get("decision") !== "approve")
    redirect(
      callbackUrl(check.redirectUri, {
        error: "access_denied",
        state: check.state,
      }),
    );

  const storeId = z.string().uuid().safeParse(fd.get("storeId"));
  if (!storeId.success) return { error: "יש לבחור חנות." };
  // read is always granted; write only if requested by the client AND ticked by the user
  const scopes: Scope[] = [
    "read",
    ...(check.scopes.includes("write") && fd.get("scope_write") === "on"
      ? (["write"] as const)
      : []),
  ];

  let code: string;
  try {
    code = await createAuthorizationCode({
      clientId: check.clientId,
      userId: session.user.id,
      storeId: storeId.data,
      scopes,
      codeChallenge: check.codeChallenge,
      redirectUri: check.redirectUri,
      resource: check.resource,
    });
  } catch (e) {
    if (e instanceof OAuthError && e.code === "access_denied")
      return { error: "אין לך הרשאה לחנות שנבחרה." };
    throw e;
  }
  redirect(callbackUrl(check.redirectUri, { code, state: check.state }));
}
