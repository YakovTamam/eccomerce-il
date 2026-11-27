# 0001 — Payment provider: Cardcom

Status: accepted (founder decision)

## Context

MVP_SPEC §7/§15 required choosing one Israeli clearing provider.

## Decision

Cardcom, using the LowProfile hosted payment page (API v11). Card data never touches our servers.
Code depends only on the `PaymentProvider` interface (`lib/payments/provider.ts`); `PAYMENT_PROVIDER=mock|cardcom` selects the implementation.

## Consequences

- Cardcom webhooks are not signed. `verifyWebhook` therefore never trusts the request body: it takes `LowProfileId` and fetches the result from Cardcom server-side (`GetLpResult`). Processing must still be idempotent by `provider_ref`.
- Amounts are integer agorot internally; conversion to decimal ILS happens only inside the Cardcom adapter.
- Per-store terminals (each business with its own Cardcom terminal) are out of scope; MVP uses a platform terminal from env. Revisit before onboarding real merchants.
- Endpoint/field names must be validated against the Cardcom sandbox terminal before go-live.
