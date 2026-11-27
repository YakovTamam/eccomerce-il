import { z } from "zod";

export const shippingSettingsSchema = z.object({
  pickupEnabled: z.boolean().default(true),
  pickupAddress: z.string().trim().max(200).default(""),
  deliveryEnabled: z.boolean().default(true),
  flatRateAgorot: z.number().int().min(0).max(1_000_000).default(3000),
  freeOverAgorot: z
    .number()
    .int()
    .min(0)
    .max(100_000_000)
    .nullable()
    .default(25000),
});
export type ShippingSettings = z.infer<typeof shippingSettingsSchema>;

/** settings.shipping is untrusted JSON: re-validate on every read, fall back to defaults. */
export function readShipping(settings: unknown): ShippingSettings {
  const raw = (settings as { shipping?: unknown } | null)?.shipping;
  const r = shippingSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : shippingSettingsSchema.parse({});
}
