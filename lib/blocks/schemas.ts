import { z } from "zod";

/**
 * Single source of truth for page blocks (MVP_SPEC §6). Used for validation (dashboard,
 * MCP), rendering, and the MCP tool descriptions. There is NO free HTML anywhere.
 */

const id = z.string().min(1).max(64);

/** Only our own uploads or https images. */
export const imageUrl = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (u) => u.startsWith("/uploads/") || u.startsWith("https://"),
    "כתובת תמונה לא תקינה",
  );

/** Links: internal paths, https, tel:, mailto:. Never javascript:/data:. */
export const linkUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (u) => /^(\/(?!\/)|https:\/\/|tel:|mailto:)/.test(u),
    "קישור חייב להתחיל ב-/ או https:// או tel: או mailto:",
  );

const text = (max: number) => z.string().trim().max(max);
const altText = z
  .string()
  .trim()
  .min(1, "חובה להזין תיאור (alt) לתמונה")
  .max(200);

export const heroBlock = z.object({
  id,
  type: z.literal("hero"),
  heading: text(120).min(1, "נא להזין כותרת"),
  subheading: text(300).default(""),
  image: z.object({ url: imageUrl, alt: altText }).nullable().default(null),
  cta: z
    .object({ label: text(40).min(1), href: linkUrl })
    .nullable()
    .default(null),
});

export const richTextBlock = z.object({
  id,
  type: z.literal("rich_text"),
  markdown: z.string().max(20_000), // restricted markdown, rendered without HTML (see markdown.tsx)
});

export const imageBlock = z.object({
  id,
  type: z.literal("image"),
  url: imageUrl,
  alt: altText,
  caption: text(200).default(""),
});

export const galleryBlock = z.object({
  id,
  type: z.literal("gallery"),
  images: z
    .array(z.object({ url: imageUrl, alt: altText }))
    .min(1)
    .max(24),
});

export const productGridBlock = z.object({
  id,
  type: z.literal("product_grid"),
  heading: text(120).default(""),
  source: z.discriminatedUnion("by", [
    z.object({ by: z.literal("category"), categoryId: z.string().uuid() }),
    z.object({
      by: z.literal("products"),
      productIds: z.array(z.string().uuid()).min(1).max(24),
    }),
    z.object({ by: z.literal("all") }),
  ]),
  limit: z.number().int().min(1).max(24).default(8),
});

export const featuredProductBlock = z.object({
  id,
  type: z.literal("featured_product"),
  productId: z.string().uuid(),
});

export const bannerBlock = z.object({
  id,
  type: z.literal("banner"),
  text: text(200).min(1, "נא להזין טקסט"),
  cta: z
    .object({ label: text(40).min(1), href: linkUrl })
    .nullable()
    .default(null),
  endsAt: z.string().datetime().nullable().default(null), // optional countdown
});

export const testimonialsBlock = z.object({
  id,
  type: z.literal("testimonials"),
  items: z
    .array(z.object({ quote: text(500).min(1), author: text(80).min(1) }))
    .min(1)
    .max(12),
});

export const faqBlock = z.object({
  id,
  type: z.literal("faq"),
  items: z
    .array(z.object({ question: text(200).min(1), answer: text(2000).min(1) }))
    .min(1)
    .max(30),
});

export const ctaWhatsappBlock = z.object({
  id,
  type: z.literal("cta_whatsapp"),
  label: text(60).default("להזמנה בוואטסאפ"),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "מספר בפורמט בינלאומי, למשל +972501234567"),
  message: text(300).default(""),
});

export const contactBlock = z.object({
  id,
  type: z.literal("contact"),
  heading: text(120).default("יצירת קשר"),
  phone: z
    .string()
    .regex(/^\+?[0-9\-\s]{6,20}$/)
    .nullable()
    .default(null),
  email: z.string().email().nullable().default(null),
  address: text(200).default(""),
  hours: text(300).default(""),
});

export const spacerBlock = z.object({
  id,
  type: z.literal("spacer"),
  size: z.enum(["sm", "md", "lg"]).default("md"),
});

export const blockSchema = z.discriminatedUnion("type", [
  heroBlock,
  richTextBlock,
  imageBlock,
  galleryBlock,
  productGridBlock,
  featuredProductBlock,
  bannerBlock,
  testimonialsBlock,
  faqBlock,
  ctaWhatsappBlock,
  contactBlock,
  spacerBlock,
]);

export const blocksSchema = z.array(blockSchema).max(60, "עד 60 בלוקים בעמוד");

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];
export const BLOCK_TYPES = blockSchema.options.map(
  (o) => o.shape.type.value,
) as BlockType[];

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "כותרת ראשית (Hero)",
  rich_text: "טקסט",
  image: "תמונה",
  gallery: "גלריה",
  product_grid: "רשת מוצרים",
  featured_product: "מוצר מומלץ",
  banner: "באנר / מבצע",
  testimonials: "המלצות",
  faq: "שאלות נפוצות",
  cta_whatsapp: "כפתור וואטסאפ",
  contact: "יצירת קשר",
  spacer: "רווח",
};

export const pageInputSchema = z.object({
  title: z.string().trim().min(1, "נא להזין שם עמוד").max(120),
  seo: z
    .object({
      title: z.string().trim().max(70).optional(),
      description: z.string().trim().max(200).optional(),
    })
    .default({}),
  blocks: blocksSchema,
});
export type PageInput = z.infer<typeof pageInputSchema>;

export const pageSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/,
    "אותיות לטיניות קטנות, ספרות ומקף בלבד",
  );
