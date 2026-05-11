import { createAdminClient } from "@/utils/supabase/admin";
import { requireSuperAdmin } from "@/lib/admin-guard";
import { SitesAdmin } from "@/components/sites-admin";
import type { Site } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminSitesPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data: sites } = await admin
    .from("sites")
    .select("*")
    .order("name");

  return (
    <div className="px-8 py-8 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-1">Sites</h1>
      <p className="text-sm text-muted-foreground mb-6">
        All sites in Cadence. Creating a new site seeds the standard
        inspection types automatically; you&apos;ll still need to add areas,
        requirements, and members.
      </p>
      <SitesAdmin sites={(sites ?? []) as Site[]} />
    </div>
  );
}
