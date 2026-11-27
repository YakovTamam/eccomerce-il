import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "@/lib/db/client";
import {
  oauthClients,
  oauthCodes,
  oauthGrants,
  storeMembers,
  stores,
  users,
} from "@/lib/db/schema";
import { isMemberOfStore } from "@/lib/tenancy/stores";
import {
  ACCESS_TTL_SECONDS,
  CODE_TTL_SECONDS,
  oauthUrls,
  REFRESH_TTL_SECONDS,
  SCOPES,
  type Scope,
} from "./config";
import { randomToken, sha256Hex, verifyPkce } from "./tokens";

/**
 * OAuth 2.1 authorization server for the MCP endpoint. These are PLATFORM tables (owner connection):
 * a token resolves to exactly one store, and every request re-checks membership.
 */

export class OAuthError extends Error {
  constructor(
    public code:
      | "invalid_request"
      | "invalid_client"
      | "invalid_grant"
      | "invalid_scope"
      | "invalid_redirect_uri"
      | "access_denied",
    message?: string,
  ) {
    super(message ?? code);
  }
}

// ── redirect URIs ─────────────────────────────────────────────────────────────
export function isAllowedRedirectUri(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  // native/dev clients: loopback only (RFC 8252)
  return (
    u.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  );
}

export const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(100).default("MCP client"),
  redirect_uris: z.array(z.string().max(2048)).min(1).max(10),
  token_endpoint_auth_method: z.enum(["none"]).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

export async function registerClient(input: unknown, db: Db = getDb()) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success)
    throw new OAuthError("invalid_request", "invalid client metadata");
  if (!parsed.data.redirect_uris.every(isAllowedRedirectUri))
    throw new OAuthError("invalid_redirect_uri");
  const clientId = randomToken("mcpc", 18);
  await db.insert(oauthClients).values({
    clientId,
    name: parsed.data.client_name,
    redirectUris: parsed.data.redirect_uris,
  });
  return {
    clientId,
    name: parsed.data.client_name,
    redirectUris: parsed.data.redirect_uris,
  };
}

export async function getClient(clientId: string, db: Db = getDb()) {
  const [c] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId));
  return c ?? null;
}

export function parseScopes(raw: string | null | undefined): Scope[] {
  const parts = (raw ?? "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["read"];
  if (
    !parts.every((p): p is Scope => (SCOPES as readonly string[]).includes(p))
  )
    throw new OAuthError("invalid_scope");
  return [...new Set(parts)];
}

// ── authorization code ────────────────────────────────────────────────────────
export async function createAuthorizationCode(
  input: {
    clientId: string;
    userId: string;
    storeId: string;
    scopes: Scope[];
    codeChallenge: string;
    redirectUri: string;
    resource?: string | null;
  },
  db: Db = getDb(),
) {
  const client = await getClient(input.clientId, db);
  if (!client || !client.redirectUris.includes(input.redirectUri))
    throw new OAuthError("invalid_request", "unknown client or redirect_uri");
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(input.codeChallenge))
    throw new OAuthError("invalid_request", "bad code_challenge");
  // The user must really belong to the store they are granting access to.
  if (!(await isMemberOfStore(input.userId, input.storeId, db)))
    throw new OAuthError("access_denied");
  const code = randomToken("mcpcode");
  await db.insert(oauthCodes).values({
    codeHash: sha256Hex(code),
    clientId: input.clientId,
    userId: input.userId,
    storeId: input.storeId,
    scopes: input.scopes,
    codeChallenge: input.codeChallenge,
    redirectUri: input.redirectUri,
    resource: input.resource ?? null,
    expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
  });
  return code;
}

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

const tokenBody = (
  access: string,
  refresh: string,
  scopes: string[],
): TokenResponse => ({
  access_token: access,
  token_type: "Bearer",
  expires_in: ACCESS_TTL_SECONDS,
  refresh_token: refresh,
  scope: scopes.join(" "),
});

export async function exchangeCode(
  input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    resource?: string | null;
  },
  db: Db = getDb(),
): Promise<TokenResponse> {
  // Consume the code atomically on first sight (even a failed attempt burns it).
  const [row] = await db
    .update(oauthCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(oauthCodes.codeHash, sha256Hex(input.code)),
        isNull(oauthCodes.usedAt),
        gt(oauthCodes.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row) throw new OAuthError("invalid_grant");
  if (row.clientId !== input.clientId || row.redirectUri !== input.redirectUri)
    throw new OAuthError("invalid_grant");
  if (!verifyPkce(input.codeVerifier, row.codeChallenge))
    throw new OAuthError("invalid_grant", "PKCE verification failed");
  const urls = oauthUrls();
  if (input.resource && input.resource !== urls.resource)
    throw new OAuthError("invalid_request", "unknown resource");
  if (!(await isMemberOfStore(row.userId, row.storeId, db)))
    throw new OAuthError("access_denied");

  const access = randomToken("mcp_at");
  const refresh = randomToken("mcp_rt");
  await db.insert(oauthGrants).values({
    clientId: row.clientId,
    userId: row.userId,
    storeId: row.storeId,
    scopes: row.scopes,
    resource: urls.resource,
    accessTokenHash: sha256Hex(access),
    accessExpiresAt: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000),
    refreshTokenHash: sha256Hex(refresh),
    refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });
  return tokenBody(access, refresh, row.scopes);
}

/** Refresh-token rotation. Presenting an already-rotated token revokes the whole grant (theft signal). */
export async function refreshTokens(
  input: { refreshToken: string; clientId: string },
  db: Db = getDb(),
): Promise<TokenResponse> {
  const hash = sha256Hex(input.refreshToken);
  const [reused] = await db
    .select({ id: oauthGrants.id, clientId: oauthGrants.clientId })
    .from(oauthGrants)
    .where(eq(oauthGrants.prevRefreshTokenHash, hash));
  if (reused) {
    await db
      .update(oauthGrants)
      .set({ revokedAt: new Date() })
      .where(eq(oauthGrants.id, reused.id));
    throw new OAuthError("invalid_grant", "refresh token reuse detected");
  }
  const access = randomToken("mcp_at");
  const refresh = randomToken("mcp_rt");
  const [g] = await db
    .update(oauthGrants)
    .set({
      accessTokenHash: sha256Hex(access),
      accessExpiresAt: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000),
      prevRefreshTokenHash: hash,
      refreshTokenHash: sha256Hex(refresh),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    })
    .where(
      and(
        eq(oauthGrants.refreshTokenHash, hash),
        eq(oauthGrants.clientId, input.clientId),
        isNull(oauthGrants.revokedAt),
        gt(oauthGrants.refreshExpiresAt, new Date()),
      ),
    )
    .returning();
  if (!g) throw new OAuthError("invalid_grant");
  if (!(await isMemberOfStore(g.userId, g.storeId, db))) {
    await db
      .update(oauthGrants)
      .set({ revokedAt: new Date() })
      .where(eq(oauthGrants.id, g.id));
    throw new OAuthError("access_denied");
  }
  return tokenBody(access, refresh, g.scopes);
}

/** RFC 7009: always succeeds from the caller's point of view. */
export async function revokeToken(token: string, db: Db = getDb()) {
  const h = sha256Hex(token);
  await db
    .update(oauthGrants)
    .set({ revokedAt: new Date() })
    .where(
      or(
        eq(oauthGrants.accessTokenHash, h),
        eq(oauthGrants.refreshTokenHash, h),
      ),
    );
}

// ── resource-server side ──────────────────────────────────────────────────────
export type McpAuth = {
  grantId: string;
  userId: string;
  storeId: string;
  clientId: string;
  scopes: Scope[];
};

/** Resolves a bearer token to ONE store. Every call re-checks membership and that the store is active. */
export async function authenticateAccessToken(
  token: string,
  db: Db = getDb(),
): Promise<McpAuth | null> {
  if (!token.startsWith("mcp_at_")) return null;
  const [g] = await db
    .select({
      id: oauthGrants.id,
      userId: oauthGrants.userId,
      storeId: oauthGrants.storeId,
      clientId: oauthGrants.clientId,
      scopes: oauthGrants.scopes,
      lastUsedAt: oauthGrants.lastUsedAt,
    })
    .from(oauthGrants)
    .innerJoin(
      storeMembers,
      and(
        eq(storeMembers.userId, oauthGrants.userId),
        eq(storeMembers.storeId, oauthGrants.storeId),
      ),
    )
    .innerJoin(
      stores,
      and(eq(stores.id, oauthGrants.storeId), eq(stores.status, "active")),
    )
    .where(
      and(
        eq(oauthGrants.accessTokenHash, sha256Hex(token)),
        isNull(oauthGrants.revokedAt),
        gt(oauthGrants.accessExpiresAt, new Date()),
      ),
    );
  if (!g) return null;
  await db
    .update(oauthGrants)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(oauthGrants.id, g.id),
        or(
          isNull(oauthGrants.lastUsedAt),
          sql`${oauthGrants.lastUsedAt} < now() - interval '1 minute'`,
        ),
      ),
    );
  return {
    grantId: g.id,
    userId: g.userId,
    storeId: g.storeId,
    clientId: g.clientId,
    scopes: g.scopes.filter((s): s is Scope =>
      (SCOPES as readonly string[]).includes(s),
    ),
  };
}

// ── dashboard: connections list / revoke ──────────────────────────────────────
export async function listGrantsForStore(storeId: string, db: Db = getDb()) {
  return db
    .select({
      id: oauthGrants.id,
      clientName: oauthClients.name,
      scopes: oauthGrants.scopes,
      createdAt: oauthGrants.createdAt,
      lastUsedAt: oauthGrants.lastUsedAt,
      userName: users.name,
    })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthGrants.clientId))
    .innerJoin(users, eq(users.id, oauthGrants.userId))
    .where(
      and(
        eq(oauthGrants.storeId, storeId),
        isNull(oauthGrants.revokedAt),
        gt(oauthGrants.refreshExpiresAt, new Date()),
      ),
    )
    .orderBy(desc(oauthGrants.createdAt));
}

export async function revokeGrant(
  storeId: string,
  grantId: string,
  db: Db = getDb(),
) {
  await db
    .update(oauthGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthGrants.id, grantId), eq(oauthGrants.storeId, storeId)));
}
