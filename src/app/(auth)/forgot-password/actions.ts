"use server";

import { sendPasswordResetEmail } from "@/lib/email/send-password-reset";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

export type ForgotPasswordResult = { ok: true } | { error: string };

/**
 * Public-facing: anyone can request a reset link for any email. We
 * always return success (don't leak account existence) and just
 * silently skip sending if the email doesn't belong to a real user.
 */
export async function requestPasswordResetAction(
  rawEmail: string,
): Promise<ForgotPasswordResult> {
  if (!isValidEmail(rawEmail)) return { error: "Enter a valid email address" };
  const email = normalizeEmail(rawEmail);
  const result = await sendPasswordResetEmail({ email, mode: "reset" });
  if ("error" in result) {
    // Still return ok to the user — don't surface internal email
    // service failures from a public form. Log the error server-side.
    console.error("[forgot-password] send failed:", result.error);
  }
  return { ok: true };
}
