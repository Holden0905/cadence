"use server";

import { sendPasswordResetEmail } from "@/lib/email/send-password-reset";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

export type ForgotPasswordResult = { ok: true } | { error: string };

/**
 * Public-facing: anyone can request a reset link for any email. We
 * always return success (don't leak account existence) and just
 * silently skip sending if the email doesn't belong to a real user.
 * Detailed success/failure logging happens in sendPasswordResetEmail
 * so we can confirm Resend delivery from server logs without exposing
 * anything to the public form.
 */
export async function requestPasswordResetAction(
  rawEmail: string,
): Promise<ForgotPasswordResult> {
  if (!isValidEmail(rawEmail)) return { error: "Enter a valid email address" };
  const email = normalizeEmail(rawEmail);
  console.log(`[forgot-password] request for ${email}`);
  const result = await sendPasswordResetEmail({ email, mode: "reset" });
  if ("error" in result) {
    console.error("[forgot-password] send failed:", result.error);
  } else if (result.sent) {
    console.log(
      `[forgot-password] delivered via Resend (id=${result.emailId ?? "?"})`,
    );
  } else {
    console.log(
      `[forgot-password] not sent — reason=${result.reason ?? "unknown"}`,
    );
  }
  return { ok: true };
}
