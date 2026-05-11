import { cookies } from "next/headers";
import { createAdminClient } from "@/utils/supabase/admin";
import type { Site, SiteMembership, SiteRole } from "@/lib/types";

const SITE_COOKIE = "cadence-site-id";

export async function getCurrentSiteId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SITE_COOKIE)?.value ?? null;
}

export async function setCurrentSiteId(siteId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SITE_COOKIE, siteId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

export async function clearCurrentSiteId(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SITE_COOKIE);
}

export async function getUserMemberships(
  userId: string,
): Promise<SiteMembership[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_sites")
    .select("role, is_active, sites!inner(id, name, location, is_active, created_at, updated_at)")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .returns<{ role: SiteRole; is_active: boolean; sites: Site }[]>();

  return (data ?? [])
    .filter((row) => row.sites.is_active)
    .map((row) => ({ site: row.sites, role: row.role }));
}

export async function getUserSiteRole(
  userId: string,
  siteId: string,
): Promise<SiteRole | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_sites")
    .select("role")
    .eq("profile_id", userId)
    .eq("site_id", siteId)
    .eq("is_active", true)
    .maybeSingle<{ role: SiteRole }>();
  return data?.role ?? null;
}

export function isAdminRole(role: SiteRole | null): boolean {
  return role === "super_admin" || role === "site_admin";
}

export function isSuperAdminRole(role: SiteRole | null): boolean {
  return role === "super_admin";
}
