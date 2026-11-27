/** Money is integer agorot everywhere. These helpers use string/integer math only (no floats). */

const PRICE_RE = /^\d{1,7}(?:[.,]\d{1,2})?$/;

/** "12.5" | "12,50" | "12" → 1250 ; invalid → null */
export function shekelsToAgorot(input: string): number | null {
  const v = input.trim();
  if (!PRICE_RE.test(v)) return null;
  const [whole, frac = ""] = v.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** 1250 → "12.50" (for form inputs) */
export function agorotToInput(agorot: number): string {
  return `${Math.trunc(agorot / 100)}.${String(agorot % 100).padStart(2, "0")}`;
}

/** 123450 → "₪1,234.50" (display) */
export function formatAgorot(agorot: number): string {
  const whole = String(Math.trunc(agorot / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `₪${whole}.${String(agorot % 100).padStart(2, "0")}`;
}
