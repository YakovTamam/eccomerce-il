/** Normalise a phone number to E.164. Israeli local formats (050-123-4567) → +972501234567. */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let national: string | null = null;
  if (hasPlus || digits.startsWith("00")) {
    const d = digits.startsWith("00") ? digits.slice(2) : digits;
    if (d.startsWith("972")) national = d.slice(3);
    else return /^[1-9]\d{7,14}$/.test(d) ? `+${d}` : null; // other countries: E.164 shape only
  } else if (digits.startsWith("972")) {
    national = digits.slice(3);
  } else if (digits.startsWith("0")) {
    national = digits.slice(1);
  } else {
    return null;
  }
  // Israeli numbers: 8–9 digits after the country code, first digit 2–9.
  return /^[2-9]\d{7,8}$/.test(national) ? `+972${national}` : null;
}
