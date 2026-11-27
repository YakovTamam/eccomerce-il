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

## Phase 2 — Catalog & dashboard (code complete)

### Done

- Schema + RLS: `categories`, `products`, `product_variants` (migrations 0003–0005): composite FK per store, CHECK constraints, variant `position`. ADR 0003.
- Service layer (`lib/catalog`): all via `withStore`; Zod schemas; integer-agorot money helpers.
- Dashboard: per-store area (`/stores/[storeId]/…`) guarded by session + membership; products list (variants, min price, stock), create/edit product with dynamic variants, categories CRUD, image upload with required alt text (Vercel Blob; local fallback in dev).
- Tests: 55 unit/integration (real Postgres) + 5 e2e. Acceptance met: product with 2 variants + image saved with the correct `store_id` (checked in DB), editable, invisible/unwritable from another store (service, DB FK, upload route 403).

### Remaining / notes

- Vercel env: `BLOB_READ_WRITE_TOKEN` (create a Blob store in the Vercel project) — uploads fail in production without it.
- Not in this phase: product deletion (archive status only), category parent/ordering UI, bulk stock tools, `audit_log` (Phase 5).
- Missing/foreign store pages still return HTTP 200 with 404 content (streaming), to be fixed in Phase 3.
- Dev: clear `.next` if `tsc` complains about stale route types.

## Phase 3 — Blocks & storefront (code complete)

### Done

- DB: `pages`, `page_versions` (RLS, composite FK; migrations 0006–0007). ADR 0004.
- Blocks: 12 Zod-validated types (hero, rich_text, image, gallery, product_grid, featured_product, banner (+countdown), testimonials, faq, cta_whatsapp, contact, spacer); safe markdown; renderer as server components.
- Dashboard: pages list/create, block editor (a form per block type, up/down reorder, image upload with required alt), save-as-draft / save+publish, version history (publish any version = rollback, restore into editor), signed expiring preview, theme editor (colours with automatic accessible text colour, font, radius, logo).
- Storefront (per store host, RTL, mobile-first): home (published `home` page or default product grid), product, category, custom pages; header/nav/footer, skip link, focus styles, reduced motion; SEO: titles, descriptions, canonical, Open Graph, Product JSON-LD, per-store `sitemap.xml` and `robots.txt`.
- Caching: `'use cache'` + tags, invalidated by dashboard actions.
- Tests: 68 unit/integration + 6 e2e. Acceptance met: page with 7 block types publishes and renders correctly at 375px in RTL; axe (wcag2a/aa, 2.1 a/aa) reports **no critical/serious violations** on home and product pages; rollback, preview (and tampered token), theme propagation, XSS-in-markdown all covered.
- Also fixed: `/uploads` was not passed through by the proxy (images from local-dev uploads 404'd); production build no longer prerenders tenant route handlers.

### Remaining / notes

- HTTP status for unknown store/page is still 200 with 404 content (see ADR 0004).
- Footer lacks accessibility statement / privacy / returns links (Phase 7).
- No cart / "add to cart" yet (Phase 4): product page lists variants and prices read-only.
- Drag & drop reordering not built; up/down buttons used (keyboard accessible). Can add DnD later if wanted.
- Category pages show only direct products (no nesting UI yet).
- Dev-only Next warnings about runtime data in `generateMetadata`/"instant" validation; `next build` is clean.

## Phase 4 — Cart, checkout & payment (code complete, mock provider)

### Done

- DB (RLS, migrations 0008–0009): `customers`, `carts`, `store_counters`, `orders`, `order_items`, `payments`, `invoices`, `discounts`, `outbox_jobs`. ADR 0005.
- Cart (cookie-bound, server-priced), coupons (percent / fixed / free shipping, window, usage limit), shipping (pickup / flat rate / free over threshold, configurable per store), checkout form with phone normalisation (E.164), marketing opt-in unchecked by default and timestamped.
- Payment: `MockPaymentProvider` (signed hosted page + signed webhook) and the Cardcom adapter behind the same interface; webhook `/api/webhooks/payments/[provider]`; idempotent processing; amount check; stock decrement; coupon usage; invoice (mock) and confirmation email through the outbox; refund (restocks).
- Dashboard: orders (filter, detail, status changes, full refund), coupons, shipping settings. Storefront: add to cart, cart, checkout, success pages, cart count in the header.
- Tests: 103 unit/integration (incl. concurrent webhooks, wrong amount, oversell, cross-store isolation) + 7 e2e. Acceptance met: product → cart → coupon → mock payment → order `paid` → stock down → invoice created; duplicate/forged webhooks change nothing; axe: no critical/serious violations on cart and checkout.

### Needed on Vercel before this works in production

- `AUTH_SECRET`, `APP_URL`, `CRON_SECRET` (random), `DATABASE_URL*`, `BLOB_READ_WRITE_TOKEN`.
- Payments: either `PAYMENT_PROVIDER=cardcom` + `CARDCOM_*`, or for a demo store `ALLOW_MOCK_PAYMENTS=1` (the mock is refused in production otherwise, checkout will show an error).
- A cron/pinger for `/api/cron/outbox` (Bearer `CRON_SECRET`); invoices/emails are also attempted right after payment.
- Optional: `RESEND_API_KEY` + `EMAIL_FROM` for real order e-mails.

### Remaining / notes

- Cardcom adapter still unverified against the real sandbox (field names/endpoints); invoice provider (Morning / iCount) not chosen, mock only.
- Cardcom `ReturnValue` carries `"<storeId>:<orderId>"` (73 chars): confirm Cardcom accepts that length.
- Terms/privacy/returns pages (Phase 7) are not linked from checkout yet.
- Partial refunds, abandoned-cart cleanup job, per-store payment terminals, order history/audit trail (Phase 5 `audit_log`) are out of scope for now.
- No rate limiting on public endpoints yet (Phase 7).

## Phase 5 — MCP server core (code complete)

### Done

- OAuth 2.1 authorization server (DCR, PKCE S256, consent screen in Hebrew, refresh rotation + reuse detection, revocation, metadata documents) and the MCP endpoint `/api/mcp` (stateless Streamable HTTP via the official SDK). ADR 0006.
- 12 read tools, 8 write tools (see ADR). Token ⇒ exactly one store; `store_id` is never tool input; membership/store status re-checked on every request; per-grant rate limits.
- Drafts (`drafts` table + service): page / discount / product update / campaign; readable diffs, expiry, stale detection, atomic approval, hallucinated-id protection. Dashboard: drafts list + detail (approve/reject), signed preview for page drafts, "חיבור ל-Claude" page (server URL, instructions, active connections, revoke), audit log page, pending-drafts badge.
- `audit_log` written in the same transaction as every change; `withStore` now composes nested calls into one transaction.
- Baseline security headers (X-Frame-Options DENY etc.).
- Tests: 124 unit/integration (OAuth flow, PKCE vector, reuse detection, atomic campaign rollback, stale drafts, concurrency) + 9 e2e. Acceptance met with the official MCP SDK client: full OAuth login → `get_store_overview` → `create_page` → draft (not live) → `approve_draft` → page published on the store; store A's token cannot read/modify store B (and cannot reference B's products in blocks); read-only token cannot write; revocation and refresh reuse kill access.

### To try it for real (needs the deployed HTTPS URL)

Claude → Settings → Connectors → add custom connector → `https://app.<domain>/api/mcp`. Locally you can use MCP Inspector against the same endpoints (loopback redirect URIs are allowed).
Vercel needs `APP_URL` (public https origin of app.<domain>), `AUTH_SECRET`; migrations 0010–0012 run at deploy.

### Remaining / notes

- `get_whatsapp_stats` is deferred to Phase 6. Order status via MCP excludes paid/refunded by design (confirm if you want it to go through a draft instead).
- Draft expiry is lazy (computed on read; no sweeper job). Preview links from MCP last 24h, dashboard ones 1h.
- Not built yet (agreed order): 5א catalog power tools (bulk create/update, image import by URL, price rules, per-product page blocks) and 5ב marketing foundations (feeds, UTM, Pixel/CAPI with consent, attribution report, campaign ad copy).
- Rate-limit table is cleaned opportunistically; if traffic grows move it to a proper store (Redis/Upstash).
