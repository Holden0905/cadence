import { createAdminClient } from "@/utils/supabase/admin";
import {
  FROM_ADDRESS,
  appBaseUrl,
  getResend,
} from "@/lib/email/resend-client";

export type PasswordResetMode = "reset" | "invite";

export type SendPasswordResetResult =
  | {
      ok: true;
      sent: boolean;
      reason?: "no-user" | "no-resend";
    }
  | { error: string };

/**
 * Generate a Supabase recovery link for `email` and deliver it via
 * Resend. For mode='invite', uses welcome-toned copy. For mode='reset',
 * the standard "you requested a password reset" copy.
 *
 * Silently succeeds if the user doesn't exist (no enumeration leak)
 * but returns reason='no-user' for the caller to log.
 */
export async function sendPasswordResetEmail(args: {
  email: string;
  fullName?: string | null;
  mode?: PasswordResetMode;
  siteName?: string;
}): Promise<SendPasswordResetResult> {
  const mode: PasswordResetMode = args.mode ?? "reset";
  const admin = createAdminClient();
  const resend = getResend();
  const appUrl = appBaseUrl();

  // generateLink only works for existing users. Look up first and
  // silently succeed for nonexistent users so we don't leak whether
  // an account exists.
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("email", args.email)
    .maybeSingle<{ id: string; email: string; full_name: string | null }>();

  if (!profile) return { ok: true, sent: false, reason: "no-user" };

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "recovery",
      email: profile.email,
      options: {
        redirectTo: `${appUrl}/auth/callback?next=/auth/update-password`,
      },
    });

  if (linkError || !linkData.properties?.action_link) {
    return { error: linkError?.message ?? "Failed to generate reset link" };
  }
  const actionLink = linkData.properties.action_link;

  if (!resend) return { ok: true, sent: false, reason: "no-resend" };

  const greetingName =
    args.fullName ?? profile.full_name ?? profile.email;

  const html =
    mode === "invite"
      ? buildInviteBody({
          greetingName,
          actionLink,
          siteName: args.siteName,
        })
      : buildResetBody({ greetingName, actionLink });

  const subject =
    mode === "invite"
      ? `Welcome to Cadence${args.siteName ? ` — ${args.siteName}` : ""}`
      : "Reset your Cadence password";

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [profile.email],
    subject,
    html,
  });

  if (error) {
    console.error(
      `[send-password-reset] ${mode} → ${profile.email} failed:`,
      error.message,
    );
    return { error: error.message };
  }

  return { ok: true, sent: true };
}

function buildResetBody(args: {
  greetingName: string;
  actionLink: string;
}): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;padding:20px;color:#1a1a1a;">
      <p>Hi ${args.greetingName},</p>
      <p>We received a request to reset the password on your Cadence account. Click the button below to set a new one:</p>
      <p style="margin:20px 0;">
        <a href="${args.actionLink}" style="display:inline-block;padding:10px 18px;background:#c8102e;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Reset password</a>
      </p>
      <p style="font-size:12px;color:#6b7280;">If you didn't request this, you can safely ignore this email — the link will expire and your password won't change.</p>
      <p style="font-size:12px;color:#6b7280;margin-top:24px;">— Cadence</p>
    </div>
  `;
}

function buildInviteBody(args: {
  greetingName: string;
  actionLink: string;
  siteName?: string;
}): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;padding:20px;color:#1a1a1a;">
      <p>Hi ${args.greetingName},</p>
      <p>You've been added to <strong>Cadence</strong>${args.siteName ? ` at <strong>${args.siteName}</strong>` : ""} — the weekly environmental inspection tracker.</p>
      <p>Click the button below to set your password and sign in:</p>
      <p style="margin:20px 0;">
        <a href="${args.actionLink}" style="display:inline-block;padding:10px 18px;background:#c8102e;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Set password and sign in</a>
      </p>
      <p style="font-size:12px;color:#6b7280;">If the button doesn't work, paste this link in your browser: ${args.actionLink}</p>
      <p style="font-size:12px;color:#6b7280;margin-top:24px;">— Cadence</p>
    </div>
  `;
}
