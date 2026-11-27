import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { createStoreForUser } from "@/lib/tenancy/stores";
import {
  authenticateAccessToken,
  createAuthorizationCode,
  exchangeCode,
  isAllowedRedirectUri,
  listGrantsForStore,
  OAuthError,
  parseScopes,
  refreshTokens,
  registerClient,
  revokeGrant,
  revokeToken,
} from "@/lib/oauth/service";
import { pkceChallenge, verifyPkce } from "@/lib/oauth/tokens";
import { rateLimit } from "@/lib/ratelimit";
import { safeNext } from "@/lib/auth/next";

const url = process.env.TEST_DATABASE_URL;
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"; // RFC 7636 appendix B
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

describe("safeNext (no open redirects after sign-in)", () => {
  it("keeps same-site paths, drops everything else", () => {
    expect(safeNext("/oauth/authorize?client_id=x&state=y")).toBe(
      "/oauth/authorize?client_id=x&state=y",
    );
    for (const bad of [
      "//evil.com",
      "https://evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "",
      undefined,
      null,
      "/a\nb",
    ])
      expect(safeNext(bad as string)).toBe("/");
  });
});

describe("pkce & redirect uris & scopes", () => {
  it("matches the RFC 7636 test vector and rejects bad verifiers", () => {
    expect(pkceChallenge(VERIFIER)).toBe(CHALLENGE);
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkce(VERIFIER, "x".repeat(43))).toBe(false);
    expect(verifyPkce("short", pkceChallenge("short"))).toBe(false); // too short per RFC
  });
  it("allows https and loopback http only; no fragments", () => {
    expect(isAllowedRedirectUri(REDIRECT)).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:6274/oauth/callback")).toBe(
      true,
    );
    expect(isAllowedRedirectUri("http://127.0.0.1:1234/cb")).toBe(true);
    for (const bad of [
      "http://evil.com/cb",
      "javascript:alert(1)",
      "myapp://cb",
      "https://a.com/cb#frag",
      "nonsense",
    ])
      expect(isAllowedRedirectUri(bad)).toBe(false);
  });
  it("parses scopes", () => {
    expect(parseScopes(undefined)).toEqual(["read"]);
    expect(parseScopes("read write")).toEqual(["read", "write"]);
    expect(() => parseScopes("read admin")).toThrow(OAuthError);
  });
});

describe.skipIf(!url)("OAuth 2.1 flow", () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  const suffix = Math.random().toString(36).slice(2, 8);
  let A: string, B: string, owner: string, outsider: string, clientId: string;

  const issue = async (
    storeId = A,
    userId = owner,
    scopes: ("read" | "write")[] = ["read", "write"],
  ) => {
    const code = await createAuthorizationCode(
      {
        clientId,
        userId,
        storeId,
        scopes,
        codeChallenge: CHALLENGE,
        redirectUri: REDIRECT,
      },
      db,
    );
    return exchangeCode(
      { code, clientId, redirectUri: REDIRECT, codeVerifier: VERIFIER },
      db,
    );
  };

  beforeAll(async () => {
    process.env.APP_URL = "http://app.localhost:3000";
    await migrate(db, { migrationsFolder: "drizzle" });
    const mk = async (n: string) =>
      (
        await db
          .insert(schema.users)
          .values({ email: `${n}-${suffix}@t.test`, name: n })
          .returning()
      )[0].id;
    owner = await mk("owner");
    outsider = await mk("outsider");
    A = (
      await createStoreForUser(owner, { name: "A", slug: `oaa-${suffix}` }, db)
    ).id;
    B = (
      await createStoreForUser(
        outsider,
        { name: "B", slug: `oab-${suffix}` },
        db,
      )
    ).id;
    clientId = (
      await registerClient(
        { client_name: "Claude", redirect_uris: [REDIRECT] },
        db,
      )
    ).clientId;
  });
  afterAll(async () => {
    await db.delete(schema.stores).where(sql`id in (${A}, ${B})`);
    await db.delete(schema.users).where(sql`id in (${owner}, ${outsider})`);
    await db
      .delete(schema.oauthClients)
      .where(eq(schema.oauthClients.clientId, clientId));
    await pool.end();
  });

  it("dynamic registration rejects unsafe redirect URIs", async () => {
    await expect(
      registerClient(
        { client_name: "x", redirect_uris: ["http://evil.com/cb"] },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_redirect_uri" });
    await expect(
      registerClient({ redirect_uris: [] }, db),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("issues a token bound to ONE store; authenticates it; revocation works", async () => {
    const t = await issue(A);
    expect(t).toMatchObject({ token_type: "Bearer", scope: "read write" });
    const auth = await authenticateAccessToken(t.access_token, db);
    expect(auth).toMatchObject({
      storeId: A,
      userId: owner,
      scopes: ["read", "write"],
    });
    expect(await authenticateAccessToken("mcp_at_garbage", db)).toBeNull();
    expect(await authenticateAccessToken("not-even-prefixed", db)).toBeNull();
    await revokeToken(t.access_token, db);
    expect(await authenticateAccessToken(t.access_token, db)).toBeNull();
  });

  it("a user cannot mint a token for a store they don't belong to", async () => {
    await expect(
      createAuthorizationCode(
        {
          clientId,
          userId: outsider,
          storeId: A,
          scopes: ["read"],
          codeChallenge: CHALLENGE,
          redirectUri: REDIRECT,
        },
        db,
      ),
    ).rejects.toMatchObject({ code: "access_denied" });
    const tb = await issue(B, outsider, ["read"]);
    expect((await authenticateAccessToken(tb.access_token, db))?.storeId).toBe(
      B,
    ); // B's token only ever resolves to B
  });

  it("authorization codes are single-use, PKCE-bound, redirect-bound and short-lived", async () => {
    const code = await createAuthorizationCode(
      {
        clientId,
        userId: owner,
        storeId: A,
        scopes: ["read"],
        codeChallenge: CHALLENGE,
        redirectUri: REDIRECT,
      },
      db,
    );
    await expect(
      exchangeCode(
        { code, clientId, redirectUri: REDIRECT, codeVerifier: "x".repeat(50) },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    // the failed attempt burned the code
    await expect(
      exchangeCode(
        { code, clientId, redirectUri: REDIRECT, codeVerifier: VERIFIER },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_grant" });

    const c2 = await createAuthorizationCode(
      {
        clientId,
        userId: owner,
        storeId: A,
        scopes: ["read"],
        codeChallenge: CHALLENGE,
        redirectUri: REDIRECT,
      },
      db,
    );
    await exchangeCode(
      { code: c2, clientId, redirectUri: REDIRECT, codeVerifier: VERIFIER },
      db,
    );
    await expect(
      exchangeCode(
        { code: c2, clientId, redirectUri: REDIRECT, codeVerifier: VERIFIER },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_grant" }); // replay

    const c3 = await createAuthorizationCode(
      {
        clientId,
        userId: owner,
        storeId: A,
        scopes: ["read"],
        codeChallenge: CHALLENGE,
        redirectUri: REDIRECT,
      },
      db,
    );
    await expect(
      exchangeCode(
        {
          code: c3,
          clientId,
          redirectUri: "https://claude.ai/other",
          codeVerifier: VERIFIER,
        },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_grant" });

    const c4 = await createAuthorizationCode(
      {
        clientId,
        userId: owner,
        storeId: A,
        scopes: ["read"],
        codeChallenge: CHALLENGE,
        redirectUri: REDIRECT,
      },
      db,
    );
    await db
      .update(schema.oauthCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.oauthCodes.clientId, clientId));
    await expect(
      exchangeCode(
        { code: c4, clientId, redirectUri: REDIRECT, codeVerifier: VERIFIER },
        db,
      ),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    await expect(
      createAuthorizationCode(
        {
          clientId: "nope",
          userId: owner,
          storeId: A,
          scopes: ["read"],
          codeChallenge: CHALLENGE,
          redirectUri: REDIRECT,
        },
        db,
      ),
    ).rejects.toBeInstanceOf(OAuthError);
  });

  it("refresh rotates tokens; reusing a rotated refresh token revokes the grant", async () => {
    const t1 = await issue(A);
    const t2 = await refreshTokens(
      { refreshToken: t1.refresh_token, clientId },
      db,
    );
    expect(t2.access_token).not.toBe(t1.access_token);
    expect(await authenticateAccessToken(t1.access_token, db)).toBeNull(); // old access token dead
    expect((await authenticateAccessToken(t2.access_token, db))?.storeId).toBe(
      A,
    );

    await expect(
      refreshTokens({ refreshToken: t1.refresh_token, clientId }, db),
    ).rejects.toMatchObject({ code: "invalid_grant" }); // replay
    expect(await authenticateAccessToken(t2.access_token, db)).toBeNull(); // whole grant revoked
    await expect(
      refreshTokens({ refreshToken: t2.refresh_token, clientId }, db),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("tokens die when membership is removed or the store is suspended", async () => {
    const t = await issue(A);
    await db
      .update(schema.stores)
      .set({ status: "suspended" })
      .where(eq(schema.stores.id, A));
    expect(await authenticateAccessToken(t.access_token, db)).toBeNull();
    await db
      .update(schema.stores)
      .set({ status: "active" })
      .where(eq(schema.stores.id, A));
    expect(await authenticateAccessToken(t.access_token, db)).not.toBeNull();
    await db
      .delete(schema.storeMembers)
      .where(eq(schema.storeMembers.userId, owner));
    expect(await authenticateAccessToken(t.access_token, db)).toBeNull();
    await expect(
      refreshTokens({ refreshToken: t.refresh_token, clientId }, db),
    ).rejects.toBeInstanceOf(OAuthError);
    await db
      .insert(schema.storeMembers)
      .values({ storeId: A, userId: owner, role: "owner" });
  });

  it("lists and revokes connections per store", async () => {
    const t = await issue(A);
    const grants = await listGrantsForStore(A, db);
    expect(grants.length).toBeGreaterThan(0);
    expect(grants[0].clientName).toBe("Claude");
    const mine = grants.find((g) => g.scopes.includes("write"))!;
    await revokeGrant(B, mine.id, db); // another store cannot revoke it
    expect(await authenticateAccessToken(t.access_token, db)).not.toBeNull();
    for (const g of grants) await revokeGrant(A, g.id, db);
    expect(await authenticateAccessToken(t.access_token, db)).toBeNull();
  });

  it("rate limiter counts per key and window", async () => {
    const key = `t:${suffix}`;
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await rateLimit(key, 3, 60, db));
    expect(results).toEqual([true, true, true, false, false]);
    expect(await rateLimit(`other:${suffix}`, 3, 60, db)).toBe(true);
  });
});
