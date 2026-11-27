# 0004 — Block pages, storefront rendering, caching, preview

Status: accepted

## Blocks

- `lib/blocks/schemas.ts` is the single Zod source of truth for the 12 MVP block types (validation, rendering, future MCP tool descriptions). **No raw HTML anywhere**: rich text is a restricted markdown subset parsed to an AST (`lib/blocks/markdown.ts`) and rendered as React elements; links must be `/…`, `https://`, `tel:` or `mailto:` (never `javascript:`/`data:`/`//host`); images must be our uploads or https and **always carry `alt`**.
- Stored JSON is re-validated on read (`parseStoredBlocks`), so bad legacy data degrades to an empty page instead of breaking the storefront.
- `pages.blocks` = working copy; every save inserts a `page_versions` row; publishing sets `published_version_id`; rollback = publishing an older version; "restore into editor" creates a NEW version (history is append-only). `page_versions` uses a composite FK `(store_id, page_id)` like variants.

## Theme

`stores.settings.theme` (validated on read; invalid → defaults). Text colour on brand/surface backgrounds is computed (`readableOn`) to always reach ≥ 4.5:1 — merchants cannot pick an inaccessible combination. Fonts: Heebo / Assistant via CSS variables.

## Storefront & caching (spec §11)

- Tenant routes: `/_store/<slug|hostname>/…` (home, `products/<slug>`, `category/<slug>`, `pages/<slug>`, `sitemap.xml`, `robots.txt`); proxy rewrites per Host. `/uploads`, `/_next`, `/api` pass through.
- Reads are `'use cache'` functions tagged `store:<id>` / `product:<id>` (`lib/storefront/data.ts`), invalidated with `updateTag` from dashboard Server Actions (`lib/storefront/revalidate.ts`).
- Route handlers for sitemap/robots call `connection()` so they are never prerendered with the placeholder tenant at build time.
- Known limitation: unknown stores/pages return HTTP 200 with 404 content (and `noindex`) because `notFound()` fires after the PPR shell streams. Revisit with the real domain.

## Preview

Signed (HMAC-SHA256 with `AUTH_SECRET`), expiring (1h) token carrying `{storeId, kind, id}`; served at `app.<root>/preview/<pageId>?t=…`, `noindex`. The token format is reusable for Phase 5 drafts.
