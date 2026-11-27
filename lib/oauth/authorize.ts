import { getClient, OAuthError, parseScopes } from "./service";
import { oauthUrls, type Scope } from "./config";

export type AuthorizeParams = Record<string, string | undefined>;

export type AuthorizeCheck =
  | {
      ok: true;
      clientId: string;
      clientName: string;
      redirectUri: string;
      scopes: Scope[];
      state?: string;
      codeChallenge: string;
      resource: string | null;
    }
  | { ok: false; kind: "fatal"; message: string } // never redirect: client/redirect_uri can't be trusted
  | {
      ok: false;
      kind: "redirect";
      redirectUri: string;
      error: string;
      state?: string;
    };

/** Validates an /authorize request. client_id + redirect_uri are checked FIRST; only then may errors be redirected. */
export async function checkAuthorizeRequest(
  p: AuthorizeParams,
): Promise<AuthorizeCheck> {
  if (!p.client_id || !p.redirect_uri)
    return { ok: false, kind: "fatal", message: "בקשת ההרשמה חסרה פרטים." };
  const client = await getClient(p.client_id);
  if (!client)
    return {
      ok: false,
      kind: "fatal",
      message: "האפליקציה המבקשת גישה אינה רשומה.",
    };
  if (!client.redirectUris.includes(p.redirect_uri))
    return {
      ok: false,
      kind: "fatal",
      message: "כתובת החזרה אינה תואמת את הרישום של האפליקציה.",
    };

  const bad = (error: string): AuthorizeCheck => ({
    ok: false,
    kind: "redirect",
    redirectUri: p.redirect_uri!,
    error,
    state: p.state,
  });
  if (p.response_type !== "code") return bad("unsupported_response_type");
  if (
    p.code_challenge_method !== "S256" ||
    !p.code_challenge ||
    !/^[A-Za-z0-9\-._~]{43,128}$/.test(p.code_challenge)
  )
    return bad("invalid_request");
  let scopes: Scope[];
  try {
    scopes = parseScopes(p.scope);
  } catch (e) {
    return bad(e instanceof OAuthError ? e.code : "invalid_scope");
  }
  if (p.resource && p.resource !== oauthUrls().resource)
    return bad("invalid_target");
  return {
    ok: true,
    clientId: client.clientId,
    clientName: client.name,
    redirectUri: p.redirect_uri,
    scopes,
    state: p.state,
    codeChallenge: p.code_challenge,
    resource: p.resource ?? null,
  };
}

export function callbackUrl(
  redirectUri: string,
  params: Record<string, string | undefined>,
) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params))
    if (v !== undefined) u.searchParams.set(k, v);
  u.searchParams.set("iss", oauthUrls().issuer);
  return u.toString();
}
