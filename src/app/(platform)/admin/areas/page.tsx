import { createClient } from "@/utils/supabase/server";
import { requireSiteAdmin } from "@/lib/admin-guard";
import { AreasAdmin } from "@/components/areas-admin";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminAreasPage() {
  const { siteId } = await requireSiteAdmin();
  const supabase = await createClient();
  const { data: areas } = await supabase
    .from("areas")
    .select("*")
    .eq("site_id", siteId)
    .order("sort_order");

  return (
    <div className="px-8 py-8 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-1">Areas</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Plant areas where inspections occur. Deactivating preserves history but
        stops generating new tasks.
      </p>
      <AreasAdmin areas={(areas ?? []) as Area[]} siteId={siteId} />
    </div>
  );
}
