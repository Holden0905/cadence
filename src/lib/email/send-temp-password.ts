import {
  FROM_ADDRESS,
  appBaseUrl,
  getResend,
} from "@/lib/email/resend-client";

export type TempPasswordMode = "invite" | "reset";

export type SendTempPasswordResult =
  | {
      ok: true;
      sent: boolean;
      reason?: "no-resend";
      emailId?: string;
    }
  | { error: string };

/**
 * Send a welcome (invite) or password-reset email containing a
 * temporary password the user can sign in with directly. Replaces
 * Supabase recovery links, which are single-use one-time tokens and
 * get pre-consumed by corporate email scanners (Outlook Safe Links,
 * Gmail safe-browsing, etc.) before the user clicks.
 *
 * The caller is responsible for actually setting the password on the
 * auth user and flipping profiles.must_change_password = true.
 */
export async function sendTempPasswordEmail(args: {
  email: string;
  fullName?: string | null;
  mode: TempPasswordMode;
  password: string;
  siteName?: string;
}): Promise<SendTempPasswordResult> {
  const resend = getResend();
  const appUrl = appBaseUrl();

  if (!resend) {
    console.warn(
      "[send-temp-password] RESEND_API_KEY not set — skipping email send",
    );
    return { ok: true, sent: false, reason: "no-resend" };
  }

  const greetingName = args.fullName ?? args.email;
  const loginUrl = `${appUrl}/login`;

  const html =
    args.mode === "invite"
      ? buildInviteBody({
          greetingName,
          password: args.password,
          siteName: args.siteName,
          loginUrl,
        })
      : buildResetBody({
          greetingName,
          password: args.password,
          loginUrl,
        });

  const subject =
    args.mode === "invite"
      ? `Welcome to Cadence${args.siteName ? ` — ${args.siteName}` : ""}`
      : "Your Cadence password was reset";

  console.log(
    `[send-temp-password] sending ${args.mode} email → to=${args.email} subject="${subject}" loginUrl=${loginUrl}`,
  );

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [args.email],
    subject,
    html,
  });

  if (error) {
    console.error(
      `[send-temp-password] Resend rejected ${args.email}:`,
      error,
    );
    return { error: error.message };
  }

  console.log(
    `[send-temp-password] ✓ delivered to ${args.email} (id=${data?.id ?? "?"})`,
  );
  return { ok: true, sent: true, emailId: data?.id };
}

function passwordBlock(password: string): string {
  return `
    <div style="margin:20px 0;padding:16px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;">Temporary password</p>
      <p style="margin:0;font-family:'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace;font-size:16px;font-weight:600;color:#111827;letter-spacing:0.5px;">${password}</p>
    </div>
  `;
}

function buildInviteBody(args: {
  greetingName: string;
  password: string;
  siteName?: string;
  loginUrl: string;
}): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;padding:20px;color:#1a1a1a;">
      <p>Hi ${args.greetingName},</p>
      <p>You've been added to <strong>Cadence</strong>${args.siteName ? ` at <strong>${args.siteName}</strong>` : ""} — the weekly environmental inspection tracker.</p>
      <p>Sign in with the temporary password below. You'll be prompted to choose a new password immediately after signing in.</p>
      ${passwordBlock(args.password)}
      <p style="margin:20px 0;">
        <a href="${args.loginUrl}" style="display:inline-block;padding:10px 18px;background:#c8102e;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Sign in to Cadence</a>
      </p>
      <p style="font-size:12px;color:#6b7280;">Or paste this URL in your browser: ${args.loginUrl}</p>
      <p style="font-size:12px;color:#6b7280;margin-top:24px;">— Cadence</p>
    </div>
  `;
}

function buildResetBody(args: {
  greetingName: string;
  password: string;
  loginUrl: string;
}): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;padding:20px;color:#1a1a1a;">
      <p>Hi ${args.greetingName},</p>
      <p>Your Cadence password has been reset. Sign in with the temporary password below — you'll be asked to set a new one right after signing in.</p>
      ${passwordBlock(args.password)}
      <p style="margin:20px 0;">
        <a href="${args.loginUrl}" style="display:inline-block;padding:10px 18px;background:#c8102e;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Sign in to Cadence</a>
      </p>
      <p style="font-size:12px;color:#6b7280;">Or paste this URL in your browser: ${args.loginUrl}</p>
      <p style="font-size:12px;color:#6b7280;">If you didn't request this reset, contact your site administrator — your old password no longer works.</p>
      <p style="font-size:12px;color:#6b7280;margin-top:24px;">— Cadence</p>
    </div>
  `;
}
