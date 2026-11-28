# Deploying to Vercel

## Project settings

- **Production Branch:** `main`. Preview deployments are built from every other branch.
- **Install/Build:** detected automatically (`pnpm`, `vercel-build` script).
- **Deployment Protection (SSO):** turn it off for Production if the landing page must be public.

## What the build does (`scripts/vercel-build.mjs`)

1. If `DATABASE_URL_UNPOOLED` or `DATABASE_URL` is set for that build environment: run `pnpm db:migrate`. A failed migration **fails the build**.
2. If neither is set (e.g. Preview): print a warning, skip migrations, and continue.
3. `next build`.

Recommended: give the database variables to **Production only**, so branch/preview builds never migrate the production database.

## Environment variables

| Variable                                                              | Value                                                                              | Scope                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------- |
| `DATABASE_URL`                                                        | Neon pooled connection string                                                      | Production           |
| `DATABASE_URL_UNPOOLED`                                               | Neon direct connection string (no `-pooler`)                                       | Production           |
| `AUTH_SECRET`                                                         | `openssl rand -base64 32`                                                          | Production + Preview |
| `ENCRYPTION_KEY`                                                      | `openssl rand -base64 32` (32 bytes). Never rotate once WhatsApp tokens are stored | Production + Preview |
| `CRON_SECRET`                                                         | `openssl rand -hex 32`                                                             | Production + Preview |
| `ROOT_DOMAIN`                                                         | `xn--4dbklvp7aj.xn--4dbrk0ce`                                                      | Production + Preview |
| `APP_URL`                                                             | `https://app.<root domain>` (needs a real domain, see below)                       | Production           |
| `BLOB_READ_WRITE_TOKEN`                                               | created by Vercel Storage → Blob → Connect                                         | Production           |
| `PAYMENT_PROVIDER`                                                    | `mock` or `cardcom`                                                                | Production           |
| `ALLOW_MOCK_PAYMENTS`                                                 | `1` only for a demo without Cardcom                                                | Production           |
| `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` | from the Cardcom terminal                                                          | Production           |
| `RESEND_API_KEY`, `EMAIL_FROM`                                        | optional, real order e-mails                                                       | Production           |

## What works where

- `https://<project>.vercel.app` serves the **landing page** (the platform site). Sign-up, the dashboard and storefronts need real hostnames.
- For the full product add the root domain and `app.<root>` plus a wildcard (`*.<root>`) to the Vercel project, then set `APP_URL`.
- The outbox needs a periodic call to `/api/cron/outbox` (`Authorization: Bearer $CRON_SECRET`): Vercel Pro cron or an external pinger. Invoices/e-mails are also attempted right after each payment.

## First admin

Sign up in the app, then run against the production database:

```sql
update users set platform_role = 'admin' where email = 'you@example.com';
```
