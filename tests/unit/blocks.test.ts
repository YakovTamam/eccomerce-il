import { describe, expect, it } from "vitest";
import { blocksSchema, BLOCK_TYPES } from "@/lib/blocks/schemas";
import { parseMarkdown } from "@/lib/blocks/markdown";
import {
  contrastRatio,
  readableOn,
  readTheme,
  themeCssVars,
} from "@/lib/theme/theme";
import { signPreviewToken, verifyPreviewToken } from "@/lib/preview/token";

const uuid = "00000000-0000-4000-8000-000000000001";
const sample = [
  {
    id: "1",
    type: "hero",
    heading: "ברוכים הבאים",
    image: { url: "/uploads/x/a.png", alt: "מאפייה" },
    cta: { label: "לחנות", href: "/" },
  },
  { id: "2", type: "rich_text", markdown: "# כותרת\n\nטקסט **מודגש**" },
  {
    id: "3",
    type: "image",
    url: "https://cdn.example.com/a.jpg",
    alt: "תמונה",
  },
  { id: "4", type: "gallery", images: [{ url: "/uploads/x/a.png", alt: "א" }] },
  { id: "5", type: "product_grid", source: { by: "all" } },
  { id: "6", type: "featured_product", productId: uuid },
  {
    id: "7",
    type: "banner",
    text: "מבצע!",
    endsAt: "2030-01-01T00:00:00.000Z",
  },
  { id: "8", type: "testimonials", items: [{ quote: "מעולה", author: "דנה" }] },
  { id: "9", type: "faq", items: [{ question: "?", answer: "!" }] },
  { id: "10", type: "cta_whatsapp", phone: "+972501234567" },
  { id: "11", type: "contact", email: "a@b.co" },
  { id: "12", type: "spacer" },
];

describe("block schemas", () => {
  it("defines the 12 MVP block types", () => {
    expect([...BLOCK_TYPES].sort()).toEqual(sample.map((b) => b.type).sort());
  });
  it("accepts a valid page with every block type", () => {
    expect(blocksSchema.safeParse(sample).success).toBe(true);
  });
  it("requires alt on images", () => {
    expect(
      blocksSchema.safeParse([
        { id: "x", type: "image", url: "/uploads/a.png", alt: " " },
      ]).success,
    ).toBe(false);
    expect(
      blocksSchema.safeParse([
        {
          id: "x",
          type: "gallery",
          images: [{ url: "/uploads/a.png", alt: "" }],
        },
      ]).success,
    ).toBe(false);
  });
  it("rejects javascript:/data: links and http images; unknown block types; extra html types", () => {
    const hero = (href: string) => [
      { id: "x", type: "hero", heading: "h", cta: { label: "l", href } },
    ];
    expect(blocksSchema.safeParse(hero("javascript:alert(1)")).success).toBe(
      false,
    );
    expect(blocksSchema.safeParse(hero("data:text/html,x")).success).toBe(
      false,
    );
    expect(blocksSchema.safeParse(hero("//evil.com")).success).toBe(false);
    expect(blocksSchema.safeParse(hero("https://ok.example")).success).toBe(
      true,
    );
    expect(
      blocksSchema.safeParse([
        { id: "x", type: "image", url: "http://x/a.png", alt: "a" },
      ]).success,
    ).toBe(false);
    expect(
      blocksSchema.safeParse([{ id: "x", type: "html", html: "<script>" }])
        .success,
    ).toBe(false);
  });
  it("validates whatsapp phone format", () => {
    expect(
      blocksSchema.safeParse([
        { id: "x", type: "cta_whatsapp", phone: "0501234567" },
      ]).success,
    ).toBe(false);
  });
});

describe("markdown", () => {
  it("parses headings (shifted to h2+), lists, bold, italic, links", () => {
    const ast = parseMarkdown(
      "# א\n\n- ב\n- **ג**\n\nשלום *עולם* [קישור](https://x.co)",
    );
    expect(ast[0]).toMatchObject({ t: "h", level: 2 });
    expect(ast[1]).toMatchObject({ t: "ul" });
    expect(ast[2]).toMatchObject({ t: "p" });
  });
  it("never emits raw HTML and drops unsafe link schemes", () => {
    const ast = parseMarkdown(
      "<script>alert(1)</script> [x](javascript:alert(1))",
    );
    const flat = JSON.stringify(ast);
    expect(flat).not.toContain('"t":"link"');
    expect(flat).toContain("<script>"); // kept only as literal text, rendered escaped by React
  });
});

describe("theme", () => {
  it("picks readable text on any background (>= 4.5:1)", () => {
    for (const bg of [
      "#777777",
      "#767676",
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#ffcc00",
      "#123456",
      "#ffffff",
      "#000000",
      "#808080",
    ]) {
      expect(contrastRatio(bg, readableOn(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("falls back to defaults on invalid stored settings and exposes css vars", () => {
    const t = readTheme({ theme: { primaryColor: "red", font: "comic" } });
    expect(t.primaryColor).toBe("#1f2937");
    expect(themeCssVars(t)["--on-brand"]).toBe("#ffffff");
  });
});

describe("preview tokens", () => {
  const prev = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-secret";
  const p = {
    storeId: uuid,
    kind: "page" as const,
    id: "00000000-0000-4000-8000-000000000002",
  };
  it("round-trips, expires, and rejects tampering", () => {
    const t = signPreviewToken(p, 60, 1_000_000);
    expect(verifyPreviewToken(t, 1_000_000)).toEqual(p);
    expect(verifyPreviewToken(t, 1_000_000 + 61_000)).toBeNull();
    expect(verifyPreviewToken(t.replace(/.$/, "x"), 1_000_000)).toBeNull();
    const [body] = t.split(".");
    expect(verifyPreviewToken(`${body}.AAAA`, 1_000_000)).toBeNull();
    expect(verifyPreviewToken("garbage", 1_000_000)).toBeNull();
  });
  process.env.AUTH_SECRET = prev;
});
