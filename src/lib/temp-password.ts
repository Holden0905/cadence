import { randomBytes } from "node:crypto";

/**
 * Readable charset: skips visually ambiguous characters (0/O, 1/l/I, 2/Z).
 * Long enough that a user can read it out loud over the phone if they
 * have to, but still high-entropy.
 */
const CHARSET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ3456789";

/**
 * Generate a temporary password for invite + admin reset flows.
 * Format: "Cadence-XXXX-XXXX-XXXX" (22 chars, 12 chars of entropy
 * from a 52-symbol charset = ~68 bits, comfortably stronger than
 * the 8-character min the app enforces).
 */
export function generateTempPassword(): string {
  const bytes = randomBytes(12);
  let body = "";
  for (const b of bytes) body += CHARSET[b % CHARSET.length];
  return `Cadence-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}
