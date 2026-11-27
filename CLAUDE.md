# CLAUDE.md — איקומרס.ישראל

## What this project is

Omnichannel commerce platform for Israeli businesses: online store + WhatsApp ordering with an AI agent + store management from Claude via MCP.
The full spec is in `MVP_SPEC.md`. **Read it fully before writing any code.**

## How to work

1. Follow the phases in `MVP_SPEC.md` §13 **in order**. Don't start a phase before the previous phase's acceptance criteria pass.
2. At the start of each session, read `PROGRESS.md` (create it if it's missing) and continue from where it left off.
3. At the end of each phase: run `pnpm lint && pnpm test`, commit, and update `PROGRESS.md` (done / remaining / open questions for the founder).
4. Don't add features outside the MVP scope (§2) without asking.
5. Record significant architecture decisions in `docs/decisions/NNNN-title.md`.

## Hard rules

- Multi-tenant: every DB access to business data goes through `withStore(storeId, fn)` (RLS via `SET LOCAL app.store_id`). Never query business tables without it.
- In MCP, `store_id` comes **only** from the OAuth token, never from tool input.
- Money is always an integer in agorot (`*_agorot`). Never use float.
- Validate all external input with Zod: forms, APIs, webhooks, MCP tools, and AI model output.
- Never store or pass card details. Payment goes only through the provider's hosted payment page.
- Verify the signature of every webhook (WhatsApp: `X-Hub-Signature-256`) before processing it. Make processing idempotent.
- The WhatsApp AI agent never invents a price or a product. The price always comes from the server.
- AI writes (MCP / agent) go to `audit_log`. Material changes (pages, prices, discounts) go through `drafts` and need approval.
- The domain is always handled in Punycode in code: `xn--4dbklvp7aj.xn--4dbrk0ce`.

## Conventions

- Code, names, and commits in English. UI in Hebrew, RTL.
- Tailwind with logical properties (`ms-`/`me-`/`ps-`/`pe-`). No `left`/`right`.
- Accessibility WCAG 2.1 AA / Israeli standard 5568: `alt` is required on images, full keyboard navigation.
- Package manager: pnpm. Tests: Vitest + Playwright.

## Commands

- `pnpm dev`: development (stores at `<slug>.localhost:3000`, dashboard at `app.localhost:3000`)
- `pnpm test`, `pnpm test:e2e`, `pnpm lint`
- `pnpm db:generate`, `pnpm db:migrate`
