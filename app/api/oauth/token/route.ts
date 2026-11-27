import { z } from "zod";
import {
  oauthErrorResponse,
  oauthJson,
  oauthPreflight,
} from "@/lib/oauth/http";
import {
  exchangeCode,
  getClient,
  OAuthError,
  refreshTokens,
} from "@/lib/oauth/service";
import { clientIp, rateLimit } from "@/lib/ratelimit";

const codeGrant = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_verifier: z.string().min(1),
  resource: z.string().optional(),
});
const refreshGrant = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
});

export async function POST(req: Request) {
  if (!(await rateLimit(`oauth:token:${clientIp(req)}`, 60, 60)))
    return oauthJson({ error: "rate_limited" }, 429);
  try {
    const raw = Object.fromEntries(new URLSearchParams(await req.text()));
    const clientId = typeof raw.client_id === "string" ? raw.client_id : "";
    if (!clientId || !(await getClient(clientId)))
      throw new OAuthError("invalid_client");

    if (raw.grant_type === "authorization_code") {
      const p = codeGrant.safeParse(raw);
      if (!p.success) throw new OAuthError("invalid_request");
      return oauthJson(
        await exchangeCode({
          code: p.data.code,
          clientId,
          redirectUri: p.data.redirect_uri,
          codeVerifier: p.data.code_verifier,
          resource: p.data.resource,
        }),
      );
    }
    if (raw.grant_type === "refresh_token") {
      const p = refreshGrant.safeParse(raw);
      if (!p.success) throw new OAuthError("invalid_request");
      return oauthJson(
        await refreshTokens({ refreshToken: p.data.refresh_token, clientId }),
      );
    }
    return oauthJson({ error: "unsupported_grant_type" }, 400);
  } catch (e) {
    return oauthErrorResponse(e);
  }
}
export const OPTIONS = oauthPreflight;
