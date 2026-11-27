import { formatAgorot } from "@/lib/catalog/money";
import { BLOCK_LABELS, type Block } from "@/lib/blocks/schemas";
import type { DiscountPayload, ProductChanges } from "./schemas";

const blocksLine = (blocks: Block[]) =>
  blocks.length === 0
    ? "ללא בלוקים"
    : `${blocks.length} בלוקים: ${blocks.map((b) => BLOCK_LABELS[b.type]).join(", ")}`;

export function pageCreateSummary(
  title: string,
  slug: string,
  blocks: Block[],
) {
  return [
    `יצירת עמוד חדש "${title}" (${slug === "home" ? "דף הבית" : `/pages/${slug}`})`,
    blocksLine(blocks),
    "העמוד יפורסם עם האישור",
  ];
}

export function pageUpdateSummary(
  title: string,
  before: Block[],
  after: Block[],
) {
  return [
    `עדכון העמוד "${title}"`,
    `לפני: ${blocksLine(before)}`,
    `אחרי: ${blocksLine(after)}`,
    "הגרסה החדשה תפורסם עם האישור (הגרסה הקודמת נשמרת בהיסטוריה)",
  ];
}

export function discountSummary(i: DiscountPayload["input"]) {
  const what =
    i.type === "percent"
      ? `${i.value}% הנחה`
      : i.type === "fixed"
        ? `${formatAgorot(i.value)} הנחה`
        : "משלוח חינם";
  const lines = [`קופון חדש ${i.code}: ${what}`];
  if (i.startsAt || i.endsAt)
    lines.push(
      `תוקף: ${i.startsAt ? new Date(i.startsAt).toLocaleString("he-IL") : "מיידי"} עד ${i.endsAt ? new Date(i.endsAt).toLocaleString("he-IL") : "ללא הגבלה"}`,
    );
  if (i.usageLimit) lines.push(`מוגבל ל-${i.usageLimit} שימושים`);
  return lines;
}

type ProductBefore = {
  title: string;
  status: string;
  categoryId: string | null;
  descriptionMd: string;
  variants: {
    id: string;
    title: string;
    sku: string | null;
    priceAgorot: number;
    compareAtAgorot: number | null;
    stockQty: number;
    trackStock: boolean;
  }[];
};

export function productUpdateSummary(before: ProductBefore, c: ProductChanges) {
  const lines: string[] = [`עדכון המוצר "${before.title}"`];
  if (c.title !== undefined && c.title !== before.title)
    lines.push(`שם: "${before.title}" ← "${c.title}"`);
  if (c.status !== undefined && c.status !== before.status)
    lines.push(`סטטוס: ${before.status} ← ${c.status}`);
  if (c.categoryId !== undefined && c.categoryId !== before.categoryId)
    lines.push("שינוי קטגוריה");
  if (c.descriptionMd !== undefined && c.descriptionMd !== before.descriptionMd)
    lines.push("עדכון תיאור המוצר");
  for (const p of c.variants ?? []) {
    const v = before.variants.find((x) => x.id === p.id);
    if (!v) continue;
    const name = `"${v.title}"`;
    if (p.priceAgorot !== undefined && p.priceAgorot !== v.priceAgorot)
      lines.push(
        `מחיר ${name}: ${formatAgorot(v.priceAgorot)} ← ${formatAgorot(p.priceAgorot)}`,
      );
    if (
      p.compareAtAgorot !== undefined &&
      p.compareAtAgorot !== v.compareAtAgorot
    )
      lines.push(
        `מחיר לפני הנחה ${name}: ${v.compareAtAgorot === null ? "ללא" : formatAgorot(v.compareAtAgorot)} ← ${p.compareAtAgorot === null ? "ללא" : formatAgorot(p.compareAtAgorot)}`,
      );
    if (p.stockQty !== undefined && p.stockQty !== v.stockQty)
      lines.push(`מלאי ${name}: ${v.stockQty} ← ${p.stockQty}`);
    if (p.title !== undefined && p.title !== v.title)
      lines.push(`שם וריאציה: ${name} ← "${p.title}"`);
    if (p.sku !== undefined && p.sku !== v.sku)
      lines.push(`מק״ט ${name}: ${v.sku ?? "ללא"} ← ${p.sku ?? "ללא"}`);
    if (p.trackStock !== undefined && p.trackStock !== v.trackStock)
      lines.push(`מעקב מלאי ${name}: ${p.trackStock ? "פעיל" : "כבוי"}`);
  }
  return lines;
}
