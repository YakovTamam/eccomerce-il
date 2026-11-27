import {
  oauthErrorResponse,
  oauthJson,
  oauthPreflight,
} from "@/lib/oauth/http";
import { OAuthError, registerClient } from "@/lib/oauth/service";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/** RFC 7591 Dynamic Client Registration (public clients only; PKCE is mandatory at /authorize). */
export async function POST(req: Request) {
  if (!(await rateLimit(`oauth:register:${clientIp(req)}`, 20, 3600)))
    return oauthJson({ error: "rate_limited" }, 429);
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object")
      throw new OAuthError("invalid_request");
    const c = await registerClient(body);
    return oauthJson(
      {
        client_id: c.clientId,
        client_name: c.name,
        redirect_uris: c.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      201,
    );
  } catch (e) {
    if (e instanceof OAuthError && e.code === "invalid_redirect_uri")
      return oauthJson(
        {
          error: "invalid_redirect_uri",
          error_description: "redirect URIs must be https or loopback http",
        },
        400,
      );
    if (e instanceof OAuthError && e.code === "invalid_request")
      return oauthJson({ error: "invalid_client_metadata" }, 400);
    return oauthErrorResponse(e);
  }
}
export const OPTIONS = oauthPreflight;
