# 0007 — Super-admin panel

Status: accepted

## Who is an admin

`users.platform_role = 'admin'`, granted **only out-of-band** with `pnpm admin:grant <email>` (against the target DB; `--revoke` removes it). We deliberately do NOT use an email allow-list in env: there is no email verification yet, so anyone registering an admin's address first would become admin. Role is re-read from the DB on every admin request. Non-admins (and signed-out users) get a 404 for `/admin/**` (existence not revealed); every server action re-checks the role.
Planned hardening: two-factor authentication (Better Auth plugin) once an email provider exists; optionally move the panel to its own host (`admin.<root>`), which needs trusted-origin/cookie configuration in Better Auth. For now it lives at `app.<root>/admin` so it shares the existing session.

## Data-access exception (rule 1)

The panel reads across stores, which `withStore` cannot do by design. `lib/admin/*` is the only place that uses the owner connection for cross-store reads, under constraints: **metadata and aggregates only** — no customer names/phones/emails, no order contents, no secrets (a test asserts a seeded customer's details never appear in any admin read model). ESLint already forbids importing the DB client from `app/**`/`components/**`; admin pages go through `lib/admin`.

## Actions (all in one transaction + `platform_audit_log`)

Suspend/activate (reason required; suspension revokes MCP grants and closes the storefront and the owner's dashboard immediately — the storefront cache is tagged even for suspended stores so reactivation invalidates correctly), change plan, domains (add with validation: IDN→punycode, never a platform/internal domain; verify, set primary only when verified, remove), WhatsApp account setup (token encrypted with AES-256-GCM, never selected back or logged), retry failed outbox jobs, revoke all MCP connections. Payments/invoices/orders are not editable here.

## Design

Own token set (`admin.css`, `.admin-root`): light + dark (OS preference, persisted toggle applied before first paint), logical properties only (RTL), accessible by construction (axe-checked in both themes), keyboard: `/` focuses search, drawer navigation on mobile (`inert` when closed), skip link, reduced-motion respected. Charts follow the dataviz rules: one validated series colour, direct tooltip + keyboard, table view, no dual axes; sparklines are decorative-with-label next to the number.
