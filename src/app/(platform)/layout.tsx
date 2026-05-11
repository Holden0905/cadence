import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentSiteId, getUserMemberships, getUserSiteRole } from "@/lib/site-context";
import { Sidebar } from "@/components/sidebar";
import type { Profile, Site } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const siteId = await getCurrentSiteId();
  if (!siteId) redirect("/auth/resolve-site");

  const role = await getUserSiteRole(user.id, siteId);
  if (!role) redirect("/auth/resolve-site");

  const admin = createAdminClient();
  const [{ data: profile }, { data: currentSite }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    admin.from("sites").select("*").eq("id", siteId).maybeSingle<Site>(),
  ]);

  if (!profile) redirect("/login");
  if (!currentSite || !currentSite.is_active) redirect("/auth/resolve-site");

  const memberships = await getUserMemberships(user.id);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        profile={profile}
        currentSite={currentSite}
        currentRole={role}
        memberships={memberships}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
