import { describe, expect, it } from "vitest";
import {
  agorotToInput,
  formatAgorot,
  shekelsToAgorot,
} from "@/lib/catalog/money";
import { parseProductForm } from "@/lib/catalog/schemas";
import { sniffImage } from "@/lib/storage/images";

describe("money (integer agorot)", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12,50", 1250],
    ["0.05", 5],
    ["0", 0],
    ["19.99", 1999],
    ["1234567.89", 123456789],
  ])("shekelsToAgorot(%s) = %d", (i, o) => expect(shekelsToAgorot(i)).toBe(o));
  it.each(["", "abc", "-1", "1.234", "1e3", "12.", " "])("rejects %j", (i) =>
    expect(shekelsToAgorot(i)).toBeNull(),
  );
  it("formats without floats", () => {
    expect(agorotToInput(1999)).toBe("19.99");
    expect(agorotToInput(5)).toBe("0.05");
    expect(formatAgorot(123450)).toBe("₪1,234.50");
  });
});

const base = {
  title: "חלה",
  status: "active",
  images: [{ url: "/uploads/x/a.png", alt: "חלה קלועה" }],
  variants: [
    { title: "קטנה", price: "20", stockQty: 5, options: { size: "S" } },
    {
      title: "גדולה",
      price: "35.50",
      compareAt: "40",
      stockQty: 3,
      sku: "HALA-L",
    },
  ],
};

describe("parseProductForm", () => {
  it("converts shekels to agorot and validates", () => {
    const r = parseProductForm(JSON.stringify(base));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.variants.map((v) => v.priceAgorot)).toEqual([2000, 3550]);
      expect(r.data.variants[1].compareAtAgorot).toBe(4000);
    }
  });
  it("requires alt on every image", () => {
    const r = parseProductForm({
      ...base,
      images: [{ url: "/uploads/x/a.png", alt: " " }],
    });
    expect(r.ok).toBe(false);
  });
  it("rejects external/unknown image urls", () => {
    expect(
      parseProductForm({
        ...base,
        images: [{ url: "http://evil/x.png", alt: "x" }],
      }).ok,
    ).toBe(false);
  });
  it("rejects bad prices, negative stock, duplicate SKUs, compare-at <= price, no variants", () => {
    const v = (o: object) => ({
      ...base,
      variants: [{ title: "a", price: "10", stockQty: 1, ...o }],
    });
    expect(parseProductForm(v({ price: "10.999" })).ok).toBe(false);
    expect(parseProductForm(v({ stockQty: -1 })).ok).toBe(false);
    expect(parseProductForm(v({ compareAt: "10" })).ok).toBe(false);
    expect(parseProductForm({ ...base, variants: [] }).ok).toBe(false);
    expect(
      parseProductForm({
        ...base,
        variants: [
          { title: "a", price: "1", stockQty: 1, sku: "X" },
          { title: "b", price: "1", stockQty: 1, sku: "X" },
        ],
      }).ok,
    ).toBe(false);
  });
  it("rejects garbage", () => {
    expect(parseProductForm("{nope").ok).toBe(false);
    expect(parseProductForm(null).ok).toBe(false);
  });
});

describe("sniffImage", () => {
  it("detects by magic bytes, rejects svg/html", () => {
    expect(
      sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]))
        ?.ext,
    ).toBe("png");
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe(
      "jpg",
    );
    expect(
      sniffImage(new TextEncoder().encode("<svg xmlns='x'></svg>")),
    ).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
});
