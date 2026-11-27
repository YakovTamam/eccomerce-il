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
