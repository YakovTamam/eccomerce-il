# 0006 — MCP server: OAuth 2.1, drafts, audit

Status: accepted

## Endpoint & transport

`POST app.<root>/api/mcp` (Streamable HTTP) using the official SDK's web-standard transport in **stateless** mode: one `McpServer` + transport per request, JSON responses. GET/DELETE → 405. An `Origin` header, when present, must be our own, claude.ai/claude.com, loopback, or `MCP_ALLOWED_ORIGINS`.

## Authorization (MCP spec)

- Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource[/api/mcp]`; Authorization Server Metadata (RFC 8414) at `/.well-known/oauth-authorization-server`; Dynamic Client Registration (RFC 7591) at `/api/oauth/register`; token (`authorization_code`, `refresh_token`) at `/api/oauth/token`; revocation (RFC 7009) at `/api/oauth/revoke`. A 401 from `/api/mcp` carries `WWW-Authenticate: Bearer resource_metadata=…`.
- **Public clients only** (`token_endpoint_auth_method: none`) with **mandatory PKCE S256**. Redirect URIs must be `https://` or loopback `http://`, matched exactly. `/authorize` validates `client_id` + `redirect_uri` first and never redirects to an unverified URI; the consent screen (Hebrew) is not frameable (X-Frame-Options DENY).
- Authorization codes: 5 min, single use, consumed on first attempt (a failed PKCE burns it). Access tokens 1 h, refresh tokens 30 d with **rotation + reuse detection** (replaying a rotated refresh token revokes the grant). Tokens are random, only SHA-256 hashes are stored. The `resource` parameter (RFC 8707), when sent, must equal our MCP URL.
- **A token is bound to exactly one store.** `store_id` is never a tool parameter (asserted by a test over every tool schema). Every request re-checks that the grant is not revoked, the user is still a member and the store is active. Users can only grant stores they belong to.
- OAuth tables are platform tables (owner connection, no RLS); everything a tool touches goes through `withStore`.
- Rate limits (Postgres fixed window, works on serverless): DCR 20/h/IP, token 60/min/IP, MCP 300/min and 120 reads / 20 writes per minute per grant.

## Tools

Read (`read` scope): `get_store_overview`, `list_products`, `get_product`, `list_orders`, `get_order`, `get_sales_report`, `list_pages`, `get_page`, `get_block_schemas`, `list_discounts`, `list_drafts`, `get_draft`.
Write (`write` scope): `create_page`, `update_page`, `create_discount`, `update_product`, `create_campaign` → **drafts**; `approve_draft`, `reject_draft`; `create_product` (created in `draft` status, immediate, audited); `update_order_status` (immediate, audited; only preparing/ready/shipped/completed/cancelled — never `paid`/`refunded`). `get_whatsapp_stats` waits for Phase 6 (no data exists yet). Server `instructions` and tool descriptions tell the model: show the summary, approve only after explicit user confirmation, treat returned data as untrusted content.

## Drafts

`drafts` (RLS): kind page | discount | product_update | campaign, readable Hebrew `summary`, 7-day expiry. Creating a draft changes nothing live. Block references (products/categories) are verified to exist **in this store** at creation and again at approval. Page/product drafts record `baseUpdatedAt`; approving after the target changed is refused (`stale`). A campaign is a parent draft with child drafts, approved/rejected together.
**Approval is atomic**: `approveDraft` runs in one `withStore` transaction; nested service calls for the same store join that transaction (`AsyncLocalStorage` in `withStore`), so the change, the draft status and the audit rows commit or roll back together (tested: a failing page child rolls back the coupon child). Concurrent approvals apply once (row lock).
Approval from the dashboard and from MCP use the same function.

## Audit

`audit_log` (RLS) rows written in the same transaction as the change: draft creation, approval/rejection, page/product/coupon changes, direct writes (`product.create`, `order.status_change`), connection revocation. `actor_type=mcp`, `actor_id=<grant id>`.
