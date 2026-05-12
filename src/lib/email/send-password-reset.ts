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
      emailId?: string;
    }
  | { error: string };

/**
 * Generate a Supabase recovery link for `email` and deliver it via
 * Resend (NOT Supabase's built-in mailer). Same Resend client and
 * From address (`Cadence <cadence@pesldar.com>`) used by the nudge
 * and summary emails.
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

  console.log(
    `[send-password-reset] start mode=${mode} email=${args.email} appUrl=${appUrl} resend=${resend ? "configured" : "MISSING"} from=${FROM_ADDRESS}`,
  );

  // Case-insensitive lookup so a typo like "Brian@Stepan.com" still
  // resolves the profile that was stored lowercase.
  const { data: profile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .ilike("email", args.email)
    .maybeSingle<{ id: string; email: string; full_name: string | null }>();

  if (profileLookupError) {
    console.error(
      "[send-password-reset] profile lookup failed:",
      profileLookupError,
    );
    return { error: profileLookupError.message };
  }

  if (!profile) {
    console.log(
      `[send-password-reset] no profile for ${args.email} — silently skipping send`,
    );
    return { ok: true, sent: false, reason: "no-user" };
  }

  // Supabase's generateLink for recovery returns an implicit-flow link
  // (token in the URL hash). Hashes don't reach the server, so the
  // recovery callback must be a client page — /update-password parses
  // the hash and calls setSession itself. Don't route through
  // /auth/callback (which is server-side code exchange / PKCE only).
  const redirectTo = `${appUrl}/update-password`;
  const generatedAt = new Date();
  console.log(
    `[send-password-reset] generating recovery link for ${profile.email} at ${generatedAt.toISOString()} (epoch=${Math.floor(generatedAt.getTime() / 1000)}) with redirect_to=${redirectTo}`,
  );

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "recovery",
      email: profile.email,
      options: { redirectTo },
    });

  if (linkError || !linkData.properties?.action_link) {
    console.error("[send-password-reset] generateLink failed:", linkError);
    return { error: linkError?.message ?? "Failed to generate reset link" };
  }
  const actionLink = linkData.properties.action_link;

  // Detailed link diagnostics so we can rule out (a) truncation in the
  // email HTML, (b) double-encoding, and (c) compare expiry timestamps
  // when users report "link expired".
  try {
    const parsed = new URL(actionLink);
    const params = parsed.searchParams;
    console.log(
      "[send-password-reset] action_link DETAILS:",
      JSON.stringify(
        {
          host: parsed.host,
          path: parsed.pathname,
          length: actionLink.length,
          token_present: !!params.get("token"),
          token_prefix: params.get("token")?.slice(0, 12) ?? null,
          token_hash_present: !!params.get("token_hash"),
          type: params.get("type"),
          redirect_to: params.get("redirect_to"),
          all_param_names: Array.from(params.keys()),
          // properties on generateLink may include hashed_token,
          // verification_type, etc. — log the lot.
          generateLink_properties: linkData.properties,
        },
        null,
        2,
      ),
    );
    console.log(
      `[send-password-reset] FULL action_link: ${actionLink}`,
    );
  } catch (err) {
    console.error(
      "[send-password-reset] could not parse action_link as URL:",
      err,
      "raw:",
      actionLink,
    );
  }

  if (!resend) {
    console.warn(
      "[send-password-reset] Resend client unavailable — RESEND_API_KEY not set in this env",
    );
    return { ok: true, sent: false, reason: "no-resend" };
  }

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

  // Sanity-check that the action_link appears, verbatim, in the
  // rendered HTML body — proves nothing on our side is truncating it.
  const linkAppearancesInBody = (html.match(
    new RegExp(actionLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
  ) ?? []).length;
  console.log(
    `[send-password-reset] html length=${html.length} chars; action_link appears ${linkAppearancesInBody}× in body`,
  );

  console.log(
    `[send-password-reset] sending via Resend → from=${FROM_ADDRESS} to=${profile.email} subject="${subject}"`,
  );

  const sendResult = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [profile.email],
    subject,
    html,
  });

  console.log(
    "[send-password-reset] Resend response:",
    JSON.stringify(sendResult),
  );

  if (sendResult.error) {
    console.error(
      `[send-password-reset] ${mode} → ${profile.email} Resend rejected:`,
      sendResult.error,
    );
    return { error: sendResult.error.message };
  }

  console.log(
    `[send-password-reset] ✓ delivered to ${profile.email} (id=${sendResult.data?.id ?? "?"})`,
  );

  return { ok: true, sent: true, emailId: sendResult.data?.id };
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
