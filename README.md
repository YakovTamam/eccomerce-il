# איקומרס.ישראל

Omnichannel commerce platform for Israeli businesses: an online store, ordering over WhatsApp with an AI agent, and store management from Claude through MCP. Hebrew, right-to-left, built for Israel (local payments, invoices, accessibility).

> **Status:** phases 0–5 of the MVP are built (catalog, storefront and page builder, checkout and payments, MCP server), plus a super-admin panel and the marketing landing page. WhatsApp ordering (phase 6) and launch polish (phase 7) are next. See [PROGRESS.md](PROGRESS.md).

## What is in the box

- **Multi-tenant stores** on sub-domains (`<slug>.<root domain>`) with Postgres Row Level Security (`withStore`).
- **Catalog, page builder, storefront:** products and variants, 12 block types, page versions and preview, SEO, themes.
- **Checkout:** cart, coupons, shipping, orders, hosted-payment providers (mock and Cardcom), idempotent webhooks, invoices and e-mails through an outbox.
- **MCP server (OAuth 2.1):** Claude reads the store and prepares changes as drafts that only go live after approval; every change is audited.
- **Super-admin panel** (`/admin`): stores, domains, WhatsApp setup, system health, audit.
- **Landing page** at the platform root.

## Stack

Next.js (App Router, Cache Components), TypeScript strict, Tailwind, Drizzle ORM + Neon Postgres, Better Auth, Zod, Vitest, Playwright.

## Getting started

```bash
pnpm install
cp .env.example .env.local      # fill in DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY, ...
pnpm db:migrate
pnpm dev
```

Local hosts: landing `localhost:3000`, dashboard `app.localhost:3000`, stores `<slug>.localhost:3000`, admin `app.localhost:3000/admin`.

```bash
pnpm lint && pnpm test          # unit + database integration (needs TEST_DATABASE_URL)
pnpm test:e2e                   # Playwright
pnpm admin:grant you@example.com   # make a user a platform admin
ALLOW_DEMO_SEED=1 pnpm seed:demo   # fill a LOCAL database with demo data
```

## Documentation

- [MVP_SPEC.md](MVP_SPEC.md): the product specification (source of truth) · [CLAUDE.md](CLAUDE.md): working rules
- [docs/decisions](docs/decisions): architecture decision records · [docs/DEPLOY.md](docs/DEPLOY.md): deploying to Vercel (settings, environment variables)

## Hard rules

Every business-data query goes through `withStore`; money is integer agorot; all external input is validated with Zod; card data never touches our servers; webhooks are verified and idempotent; AI changes go through drafts and the audit log.
