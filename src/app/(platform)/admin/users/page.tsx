import { createAdminClient } from "@/utils/supabase/admin";
import { requireSiteAdmin } from "@/lib/admin-guard";
import { isSuperAdminRole } from "@/lib/site-context";
import { UsersAdmin, type SiteUserRow } from "@/components/users-admin";
import type { Profile, SiteRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { siteId, role, user } = await requireSiteAdmin();
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("user_sites")
    .select("id, role, is_active, profiles!inner(*)")
    .eq("site_id", siteId)
    .returns<
      {
        id: string;
        role: SiteRole;
        is_active: boolean;
        profiles: Profile;
      }[]
    >();

  const users: SiteUserRow[] = (rows ?? [])
    .map((r) => ({
      membershipId: r.id,
      profile: r.profiles,
      role: r.role,
      isActive: r.is_active,
    }))
    .sort((a, b) =>
      (a.profile.full_name ?? a.profile.email).localeCompare(
        b.profile.full_name ?? b.profile.email,
      ),
    );

  return (
    <div className="px-8 py-8 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-1">Users</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Users at this site. Invite by email — if they don&apos;t have an
        account yet, one is created for them automatically.
      </p>
      <UsersAdmin
        users={users}
        callerIsSuperAdmin={isSuperAdminRole(role)}
        callerProfileId={user.id}
      />
    </div>
  );
}
