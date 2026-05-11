"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  getCurrentSiteId,
  getUserSiteRole,
  isAdminRole,
  isSuperAdminRole,
} from "@/lib/site-context";
import { isValidEmail, normalizeEmail } from "@/lib/validation";
import { sendPasswordResetEmail } from "@/lib/email/send-password-reset";
import type { SiteRole } from "@/lib/types";

export type InviteResult =
  | { error: string }
  | { ok: true; created: boolean; emailSent: boolean; emailReason?: string };

export async function inviteUserAction(args: {
  email: string;
  fullName: string;
  role: SiteRole;
}): Promise<InviteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const siteId = await getCurrentSiteId();
  if (!siteId) return { error: "No site selected" };

  const callerRole = await getUserSiteRole(user.id, siteId);
  if (!callerRole || !isAdminRole(callerRole)) {
    return { error: "Not authorized" };
  }
  if (args.role === "super_admin" && !isSuperAdminRole(callerRole)) {
    return { error: "Only super admins can assign super admin role" };
  }

  if (!isValidEmail(args.email)) {
    return { error: "Enter a valid email address" };
  }
  const email = normalizeEmail(args.email);
  const fullName = args.fullName.trim();
  if (!fullName) return { error: "Full name required" };

  const admin = createAdminClient();

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("email", email)
    .maybeSingle<{ id: string; full_name: string | null }>();

  let profileId: string;
  let created = false;

  if (existingProfile) {
    profileId = existingProfile.id;
    if (fullName && !existingProfile.full_name) {
      await admin
        .from("profiles")
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq("id", profileId);
    }
  } else {
    const tempPassword =
      "Cadence" +
      Math.random().toString(36).slice(2, 10) +
      Math.floor(Math.random() * 99 + 10) +
      "!";
    const { data: createRes, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
    if (createErr || !createRes.user) {
      return { error: createErr?.message ?? "Failed to create user" };
    }
    profileId = createRes.user.id;
    created = true;

    if (fullName) {
      await admin
        .from("profiles")
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq("id", profileId);
    }
  }

  const { data: existingMembership } = await admin
    .from("user_sites")
    .select("id")
    .eq("profile_id", profileId)
    .eq("site_id", siteId)
    .maybeSingle<{ id: string }>();

  if (existingMembership) {
    const { error: updErr } = await admin
      .from("user_sites")
      .update({ role: args.role, is_active: true })
      .eq("id", existingMembership.id);
    if (updErr) return { error: updErr.message };
  } else {
    const { error: insErr } = await admin.from("user_sites").insert({
      profile_id: profileId,
      site_id: siteId,
      role: args.role,
    });
    if (insErr) return { error: insErr.message };
  }

  // Welcome email — only for newly-created users (existing users already
  // have a password). Failure to deliver doesn't block the invite.
  let emailSent = false;
  let emailReason: string | undefined;
  if (created) {
    const { data: siteRow } = await admin
      .from("sites")
      .select("name")
      .eq("id", siteId)
      .maybeSingle<{ name: string }>();
    const result = await sendPasswordResetEmail({
      email,
      fullName,
      mode: "invite",
      siteName: siteRow?.name,
    });
    if ("error" in result) {
      emailReason = result.error;
    } else {
      emailSent = result.sent;
      emailReason = result.reason;
    }
  }

  revalidatePath("/admin/users");
  return { ok: true, created, emailSent, emailReason };
}

export async function updateUserSiteRoleAction(
  membershipId: string,
  role: SiteRole,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const siteId = await getCurrentSiteId();
  if (!siteId) return { error: "No site selected" };

  const callerRole = await getUserSiteRole(user.id, siteId);
  if (!callerRole || !isAdminRole(callerRole)) {
    return { error: "Not authorized" };
  }
  if (role === "super_admin" && !isSuperAdminRole(callerRole)) {
    return { error: "Only super admins can assign super admin role" };
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("user_sites")
    .select("site_id")
    .eq("id", membershipId)
    .maybeSingle<{ site_id: string }>();
  if (!membership) return { error: "Membership not found" };
  if (membership.site_id !== siteId) return { error: "Wrong site" };

  const { error } = await admin
    .from("user_sites")
    .update({ role })
    .eq("id", membershipId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function toggleUserSiteActiveAction(
  membershipId: string,
  isActive: boolean,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const siteId = await getCurrentSiteId();
  if (!siteId) return { error: "No site selected" };

  const callerRole = await getUserSiteRole(user.id, siteId);
  if (!callerRole || !isAdminRole(callerRole)) {
    return { error: "Not authorized" };
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("user_sites")
    .select("site_id, profile_id")
    .eq("id", membershipId)
    .maybeSingle<{ site_id: string; profile_id: string }>();
  if (!membership) return { error: "Membership not found" };
  if (membership.site_id !== siteId) return { error: "Wrong site" };

  if (membership.profile_id === user.id && !isActive) {
    return { error: "You cannot deactivate your own account" };
  }

  const { error } = await admin
    .from("user_sites")
    .update({ is_active: isActive })
    .eq("id", membershipId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Remove a user's membership from the current site. Returns
 * { remainingMemberships } so the UI can warn when the user will
 * have no other site access after this.
 */
export async function deleteUserMembershipAction(
  membershipId: string,
): Promise<
  | { error: string }
  | { ok: true; remainingMemberships: number; profileId: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const siteId = await getCurrentSiteId();
  if (!siteId) return { error: "No site selected" };

  const callerRole = await getUserSiteRole(user.id, siteId);
  if (!callerRole || !isAdminRole(callerRole)) {
    return { error: "Not authorized" };
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("user_sites")
    .select("site_id, profile_id")
    .eq("id", membershipId)
    .maybeSingle<{ site_id: string; profile_id: string }>();
  if (!membership) return { error: "Membership not found" };
  if (membership.site_id !== siteId) return { error: "Wrong site" };
  if (membership.profile_id === user.id) {
    return { error: "You cannot remove your own membership" };
  }

  const { error: delErr } = await admin
    .from("user_sites")
    .delete()
    .eq("id", membershipId);
  if (delErr) return { error: delErr.message };

  const { count } = await admin
    .from("user_sites")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", membership.profile_id);

  revalidatePath("/admin/users");
  return {
    ok: true,
    remainingMemberships: count ?? 0,
    profileId: membership.profile_id,
  };
}

/**
 * Edit profile (full_name + email). Updates auth.users + profiles via
 * the admin_update_user SECURITY DEFINER function so the email change
 * applies immediately without Supabase's confirmation flow.
 */
export async function updateUserProfileAction(args: {
  profileId: string;
  email: string;
  fullName: string;
}): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const siteId = await getCurrentSiteId();
  if (!siteId) return { error: "No site selected" };

  const callerRole = await getUserSiteRole(user.id, siteId);
  if (!callerRole || !isAdminRole(callerRole)) {
    return { error: "Not authorized" };
  }

  if (!isValidEmail(args.email))
    return { error: "Enter a valid email address" };
  const email = normalizeEmail(args.email);
  const fullName = args.fullName.trim();
  if (!fullName) return { error: "Full name required" };

  const admin = createAdminClient();
  // Verify the target is a member of the caller's site (so we don't
  // let a site admin edit users outside their scope).
  const { data: targetMembership } = await admin
    .from("user_sites")
    .select("id")
    .eq("profile_id", args.profileId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (!targetMembership)
    return { error: "Target user is not a member of this site" };

  const { error } = await admin.rpc("admin_update_user", {
    target_user_id: args.profileId,
    new_email: email,
    new_full_name: fullName,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Admin-initiated password reset — generates a Supabase recovery link
 * and emails it via Resend.
 */
export async function sendUserPasswordResetAction(args: {
  email: string;
  fullName?: string | null;
}): Promise<{ error: string } | { ok: true; sent: boolean; reason?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const siteId = await getCurrentSiteId();
  if (!siteId) return { error: "No site selected" };

  const callerRole = await getUserSiteRole(user.id, siteId);
  if (!callerRole || !isAdminRole(callerRole)) {
    return { error: "Not authorized" };
  }
  if (!isValidEmail(args.email))
    return { error: "Invalid email" };

  const result = await sendPasswordResetEmail({
    email: normalizeEmail(args.email),
    fullName: args.fullName,
    mode: "reset",
  });
  if ("error" in result) return { error: result.error };
  return { ok: true, sent: result.sent, reason: result.reason };
}
