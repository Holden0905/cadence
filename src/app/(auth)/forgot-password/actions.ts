"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { isValidEmail, normalizeEmail } from "@/lib/validation";
import { generateTempPassword } from "@/lib/temp-password";
import { sendTempPasswordEmail } from "@/lib/email/send-temp-password";

export type ForgotPasswordResult = { ok: true } | { error: string };

/**
 * Public-facing self-service reset. Same mechanism as the admin reset:
 * generate a fresh temp password, set it on auth.users, flip
 * must_change_password, and email the temp password directly (no
 * recovery links — those get pre-consumed by Outlook Safe Links and
 * similar gateways).
 *
 * Returns ok regardless of whether the email exists, so the form
 * doesn't leak account presence. Failures are logged server-side.
 */
export async function requestPasswordResetAction(
  rawEmail: string,
): Promise<ForgotPasswordResult> {
  if (!isValidEmail(rawEmail))
    return { error: "Enter a valid email address" };
  const email = normalizeEmail(rawEmail);
  console.log(`[forgot-password] request for ${email}`);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .ilike("email", email)
    .maybeSingle<{ id: string; email: string; full_name: string | null }>();

  if (!profile) {
    console.log(
      `[forgot-password] no profile for ${email} — silently returning ok`,
    );
    return { ok: true };
  }

  const tempPassword = generateTempPassword();
  const { error: updErr } = await admin.auth.admin.updateUserById(
    profile.id,
    { password: tempPassword },
  );
  if (updErr) {
    console.error(
      `[forgot-password] updateUserById failed for ${email}:`,
      updErr,
    );
    return { ok: true };
  }

  const { error: flagErr } = await admin
    .from("profiles")
    .update({
      must_change_password: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);
  if (flagErr) {
    console.error(
      `[forgot-password] failed to set must_change_password for ${email}:`,
      flagErr,
    );
  }

  const result = await sendTempPasswordEmail({
    email: profile.email,
    fullName: profile.full_name,
    mode: "reset",
    password: tempPassword,
  });
  if ("error" in result) {
    console.error(
      `[forgot-password] email send failed for ${email}:`,
      result.error,
    );
  } else if (result.sent) {
    console.log(
      `[forgot-password] delivered via Resend (id=${result.emailId ?? "?"})`,
    );
  }

  return { ok: true };
}
