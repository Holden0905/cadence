import { inspect } from "node:util";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  getCurrentSiteId,
  getUserSiteRole,
  isAdminRole,
  isSuperAdminRole,
} from "@/lib/site-context";
import type { Profile, SiteRole } from "@/lib/types";

export type AuthContext = {
  user: { id: string; email: string };
  profile: Profile;
  siteId: string;
  role: SiteRole;
};

async function loadAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (profileError) {
    console.error(
      "[auth] profile lookup failed:",
      inspect(profileError, { showHidden: true, depth: 4, getters: true }),
    );
    return null;
  }
  if (!profile) return null;

  const siteId = await getCurrentSiteId();
  if (!siteId) return null;

  const role = await getUserSiteRole(user.id, siteId);
  if (!role) return null;

  return {
    user: { id: user.id, email: user.email ?? profile.email },
    profile,
    siteId,
    role,
  };
}

/** Require authenticated user with a valid site selected. Redirects otherwise. */
export async function requireSiteContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const siteId = await getCurrentSiteId();
  if (!siteId) redirect("/select-site");

  const role = await getUserSiteRole(user.id, siteId);
  if (!role) redirect("/select-site");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!profile) redirect("/login");

  return {
    user: { id: user.id, email: user.email ?? profile.email },
    profile,
    siteId,
    role,
  };
}

/** Require site_admin or super_admin at current site. */
export async function requireSiteAdmin(): Promise<AuthContext> {
  const ctx = await requireSiteContext();
  if (!isAdminRole(ctx.role)) redirect("/dashboard");
  return ctx;
}

/** Require super_admin (at any site). */
export async function requireSuperAdmin(): Promise<AuthContext> {
  const ctx = await requireSiteContext();
  if (!isSuperAdminRole(ctx.role)) redirect("/dashboard");
  return ctx;
}

/** Soft check — returns context or null without redirecting. */
export async function tryGetAuthContext(): Promise<AuthContext | null> {
  return loadAuthContext();
}
