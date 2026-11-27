# PROGRESS

## Phase 0 — Infrastructure (in progress)

### Done

- Next.js (App Router) + TypeScript strict + Tailwind 4, Hebrew RTL layout (Heebo), `lang="he" dir="rtl"`.
- Drizzle + Neon client; first migration generated (`drizzle/0000_*.sql`: users, stores, store_members, store_domains).
- Zod, Vitest (unit), Playwright (e2e smoke), ESLint + Prettier. `pnpm lint`, `pnpm test`, `pnpm build` pass; e2e smoke passes.
- `.env.example` (spec §14 + Cardcom vars).
- Payments abstraction ahead of Phase 4: `PaymentProvider` interface, `MockPaymentProvider`, `CardcomPaymentProvider` (LowProfile hosted page, webhook verified via server-side GetLpResult), factory by `PAYMENT_PROVIDER`. Unit-tested with mocked fetch. See `docs/decisions/0001-payment-provider-cardcom.md`.

### Remaining for Phase 0

- Migration runs on Vercel deploy via the `vercel-build` script (`drizzle-kit migrate && next build`), since DATABASE_URL* live in Vercel, not in the Claude session. Founder confirmed the env vars are set in Vercel; not verified from here. Check the first deploy log.
- shadcn/ui init (`components.json` + first components) — not done yet.
- In sandboxed environments run e2e with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

### Open questions for the founder

1. Cardcom: terminal number, API name/password (sandbox first). Confirm endpoint/field names in the Cardcom sandbox before go-live.
2. Will each merchant use their own Cardcom terminal, or a platform terminal for MVP? (ADR 0001 assumes platform terminal.)
3. Invoice provider (Morning / iCount), parallel Latin domain, beta niche, email provider, plan pricing.

## Phase 1 — Auth & multi-tenancy (code complete, pending deploy checks)

### Done

- Better Auth (email+password): sign-up / sign-in pages (Hebrew RTL, accessible), session helper.
- Dashboard at `app.<root>` (`app.localhost:3000` in dev): list my stores, create store (Zod + slug rules + reserved slugs). Creating a store also creates the owner `store_members` row.
- `proxy.ts` + `resolve-host` (punycode, `<slug>.localhost`, custom domains, `app.`), internal route trees blocked from direct access.
- RLS: `app_rls` role + policies (migration 0002), `withStore()`; ESLint rule blocks raw DB client in UI code. ADR 0002.
- Tests: 27 unit + RLS integration tests (real Postgres 16), 4 e2e. Acceptance met: store A cannot read/write store B (incl. direct query with B's store_id); `a.localhost` / `b.localhost` show different stores.

### Remaining / known issues

- Missing store returns 404 _content_ with HTTP 200 (notFound() after streaming starts). Fix in Phase 3 with cached store resolution.
- Magic link deferred (needs email provider).
- Vercel preview URLs (`*.vercel.app`) can't exercise subdomain routing; needs the real domain.
- Vercel env needed: `AUTH_SECRET` (random 32 bytes base64), `APP_URL` (e.g. `https://app.<domain>`), plus `DATABASE_URL*`.
- Integration tests need `TEST_DATABASE_URL` (a local/test Postgres); skipped otherwise. e2e needs `DATABASE_URL`, `AUTH_SECRET`, `APP_URL=http://app.localhost:3000`.

### Open questions for the founder

- Same as Phase 0, plus: confirm the first deploy's migration log (0002 creates role `app_rls`; needs a DB owner that can CREATE ROLE — Neon's default owner can).
