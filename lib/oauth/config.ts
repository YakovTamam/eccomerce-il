import { appOrigin } from "@/lib/payments";

export const SCOPES = ["read", "write"] as const;
export type Scope = (typeof SCOPES)[number];

export const ACCESS_TTL_SECONDS = 3600;
export const REFRESH_TTL_SECONDS = 30 * 86_400;
export const CODE_TTL_SECONDS = 300;

export function oauthUrls(
  env: Record<string, string | undefined> = process.env,
) {
  const issuer = appOrigin(env);
  return {
    issuer,
    resource: `${issuer}/api/mcp`,
    authorization: `${issuer}/oauth/authorize`,
    token: `${issuer}/api/oauth/token`,
    registration: `${issuer}/api/oauth/register`,
    revocation: `${issuer}/api/oauth/revoke`,
    resourceMetadata: `${issuer}/.well-known/oauth-protected-resource/api/mcp`,
  };
}

/** RFC 9728 Protected Resource Metadata */
export function protectedResourceMetadata() {
  const u = oauthUrls();
  return {
    resource: u.resource,
    authorization_servers: [u.issuer],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "איקומרס.ישראל — ניהול חנות",
  };
}

/** RFC 8414 Authorization Server Metadata */
export function authorizationServerMetadata() {
  const u = oauthUrls();
  return {
    issuer: u.issuer,
    authorization_endpoint: u.authorization,
    token_endpoint: u.token,
    registration_endpoint: u.registration,
    revocation_endpoint: u.revocation,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"], // public clients + PKCE
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SCOPES],
  };
}
