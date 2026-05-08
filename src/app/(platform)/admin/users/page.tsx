import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/admin-guard";
import { UsersAdmin } from "@/components/users-admin";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { nullsFirst: false });

  return (
    <div className="px-8 py-8 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-1">Users</h1>
      <p className="text-sm text-muted-foreground mb-6">
        App users — created automatically when someone signs in. Promote to
        admin to grant management access.
      </p>
      <UsersAdmin users={(users ?? []) as Profile[]} />
    </div>
  );
}
