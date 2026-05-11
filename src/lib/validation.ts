export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Pragmatic email regex: non-space + @ + non-space + . + non-space.
  // Not RFC-compliant, but catches every realistic mistake (missing @,
  // missing domain, missing TLD, whitespace).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isPositiveInteger(value: number | string): boolean {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isInteger(n) && n > 0;
}
