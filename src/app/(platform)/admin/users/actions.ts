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
import type { SiteRole } from "@/lib/types";

export type InviteResult = { error: string } | { ok: true; created: boolean };

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

  const email = args.email.trim().toLowerCase();
  const fullName = args.fullName.trim();
  if (!email) return { error: "Email required" };

  const admin = createAdminClient();

  // Look up existing profile
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("email", email)
    .maybeSingle<{ id: string; full_name: string | null }>();

  let profileId: string;
  let created = false;

  if (existingProfile) {
    profileId = existingProfile.id;
    // Update name if profile didn't have one
    if (fullName && !existingProfile.full_name) {
      await admin
        .from("profiles")
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq("id", profileId);
    }
  } else {
    // Create new auth user with random temp password, email confirmed
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

    // The handle_new_user trigger creates the profile row; ensure full_name is set
    if (fullName) {
      await admin
        .from("profiles")
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq("id", profileId);
    }
  }

  // Attach to site (or reactivate existing membership)
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

  revalidatePath("/admin/users");
  return { ok: true, created };
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
    .select("site_id")
    .eq("id", membershipId)
    .maybeSingle<{ site_id: string }>();
  if (!membership) return { error: "Membership not found" };
  if (membership.site_id !== siteId) return { error: "Wrong site" };

  const { error } = await admin
    .from("user_sites")
    .update({ is_active: isActive })
    .eq("id", membershipId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}
