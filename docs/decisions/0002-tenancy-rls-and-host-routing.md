# 0002 — Tenancy: RLS role model and host routing

Status: accepted

## RLS model

- Tenant tables (`stores`, `store_members`, `store_domains`, and every future business table) have RLS enabled with policy `store_id = NULLIF(current_setting('app.store_id', true), '')::uuid`.
- The app connects as the table owner (bypasses RLS, needed for migrations/auth/platform lookups). `withStore(storeId, fn)` opens a transaction, does `SET LOCAL ROLE app_rls` (NOLOGIN, NOBYPASSRLS, explicit per-table GRANTs only) and sets `app.store_id` with `set_config(..., true)`. Inside it, even a query naming another store's `store_id` returns nothing and cross-tenant writes fail.
- Not `FORCE ROW LEVEL SECURITY`: managed Postgres owners may carry BYPASSRLS, so a dedicated role is the reliable boundary.
- New migrations that add a tenant table must `GRANT ... TO app_rls`, enable RLS and add the policy. `app_rls` has no access to auth tables (`users`, `sessions`, ...).
- Platform-level lookups that must happen before a store context exists (host→store, list my stores, create store) live in `lib/tenancy/stores.ts` using the owner connection. ESLint forbids importing `@/lib/db/client` from `app/**` and `components/**`.
- Verified by `tests/unit/rls.db.test.ts` (runs when `TEST_DATABASE_URL` is set).

## Host routing

- Next 16 renamed `middleware.ts` → `proxy.ts`; we use `proxy.ts`.
- `proxy.ts` resolves the Host (`lib/tenancy/resolve-host.ts`, punycode-normalised) and rewrites to `/_dashboard/...` (app.), `/_store/<slug>/...` (subdomain) or `/_store/<hostname>/...` (custom domain). The route folders are `%5Fdashboard` / `%5Fstore` (the `%5F` prefix creates a URL segment starting with an underscore).
- Spec said `/_app`; that path is reserved by Next (Pages Router App component) and 404s, hence `/_dashboard`.
- Direct requests to `/_store`, `/_dashboard`, `/_preview` get 404. `/api`, `/_next`, `/.well-known` pass through un-rewritten.
- `*.vercel.app` hosts serve the platform site (subdomain tenancy can't work there); real tenancy needs the root domain.

## Auth

Better Auth + Drizzle adapter, tables `users/sessions/accounts/verifications`, UUID ids. Email+password only for now; magic link waits for an email provider (open question 5).
