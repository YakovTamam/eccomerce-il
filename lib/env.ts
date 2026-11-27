import { z } from "zod";

const schema = z.object({
  ROOT_DOMAIN: z.string().default("xn--4dbklvp7aj.xn--4dbrk0ce"),
  PAYMENT_PROVIDER: z.enum(["mock", "cardcom"]).default("mock"),
  CARDCOM_TERMINAL_NUMBER: z.string().optional(),
  CARDCOM_API_NAME: z.string().optional(),
  CARDCOM_API_PASSWORD: z.string().optional(),
  CARDCOM_BASE_URL: z
    .string()
    .url()
    .default("https://secure.cardcom.solutions"),
});

export function getEnv(
  source: Record<string, string | undefined> = process.env,
) {
  return schema.parse(source);
}
