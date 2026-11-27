# 0003 — Catalog model

Status: accepted

- Tables `categories`, `products`, `product_variants` are tenant tables (RLS + `app_rls` grants, migration 0004).
- `product_variants` references `products` through a **composite FK `(store_id, product_id)`** → `products(store_id, id)`, so the database itself rejects a variant pointing at another store's product (tested). Category ownership is checked in the service (a cross-store category id is invisible under RLS).
- Money: integer agorot (`price_agorot`, `compare_at_agorot`) with CHECK constraints (>= 0); stock has `stock_qty >= 0`. The form takes shekels as a string; `lib/catalog/money.ts` converts with integer/string math only (no floats). Prices include VAT (spec §7).
- Images: `products.images` is JSONB `[{url, alt}]`; **`alt` is required** (Zod + HTML `required`) for accessibility (WCAG / ת״י 5568). Uploads go through `POST /api/uploads` (session + store membership, 5MB, magic-byte sniffing — SVG/HTML rejected), stored in Vercel Blob under `stores/<storeId>/…`; local dev without a Blob token writes to git-ignored `public/uploads/`.
- Variants keep an explicit `position`; saving a product syncs variants (update by id, insert new, delete removed). NOTE for Phase 4: once `order_items` reference variants, deleting a variant must become archive/soft-delete rather than hard delete.
- Product slugs are auto-generated (Latin titles slugified, otherwise `p-xxxxxxxx`), unique per store.
