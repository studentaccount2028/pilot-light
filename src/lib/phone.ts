// AI-assisted: written with Claude Code from the team's build spec.
// Phone numbers are E.164 at save time or the save fails.
const E164 = /^\+[1-9]\d{7,14}$/;

export function isE164(phone: string): boolean {
  return E164.test(phone);
}

// Accepts what people actually type for a US number and returns E.164, or
// null if it cannot be one.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) {
    const digits = "+" + trimmed.slice(1).replace(/[\s().-]/g, "");
    return isE164(digits) ? digits : null;
  }
  const digits = trimmed.replace(/[\s().-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
