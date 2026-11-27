import { z } from "zod";
import { imageUrl } from "@/lib/blocks/schemas";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "צבע בפורמט #RRGGBB");

export const themeSchema = z.object({
  primaryColor: hex.default("#1f2937"),
  secondaryColor: hex.default("#f3f4f6"),
  font: z.enum(["heebo", "assistant"]).default("heebo"),
  radius: z.enum(["none", "sm", "md", "lg"]).default("md"),
  logoUrl: imageUrl.nullable().default(null),
});
export type Theme = z.infer<typeof themeSchema>;

export const defaultTheme: Theme = themeSchema.parse({});

/** settings.theme is untrusted JSON (written by the dashboard / MCP): always re-validate on read. */
export function readTheme(settings: unknown): Theme {
  const raw = (settings as { theme?: unknown } | null)?.theme;
  const parsed = themeSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : defaultTheme;
}

function luminance(h: string): number {
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text color with the best contrast on `bg` — always ≥ 4.5:1 (WCAG AA) for any background. */
export function readableOn(bg: string): "#ffffff" | "#000000" {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#000000")
    ? "#ffffff"
    : "#000000";
}

const RADIUS = { none: "0px", sm: "4px", md: "8px", lg: "16px" } as const;

export function themeCssVars(t: Theme): Record<string, string> {
  return {
    "--brand": t.primaryColor,
    "--on-brand": readableOn(t.primaryColor),
    "--surface": t.secondaryColor,
    "--on-surface": readableOn(t.secondaryColor),
    "--radius": RADIUS[t.radius],
    "--font-store":
      t.font === "assistant" ? "var(--font-assistant)" : "var(--font-heebo)",
  };
}
