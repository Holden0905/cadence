import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSiteAdmin } from "@/lib/admin-guard";
import { RequirementsAdmin } from "@/components/requirements-admin";
import type {
  Area,
  AreaRequirement,
  AreaRequirementOwner,
  InspectionType,
  Profile,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminRequirementsPage() {
  const { siteId } = await requireSiteAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: areas }, { data: types }] = await Promise.all([
    supabase
      .from("areas")
      .select("*")
      .eq("site_id", siteId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("inspection_types")
      .select("*")
      .eq("site_id", siteId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const areaIds = (areas ?? []).map((a) => a.id);

  const [{ data: requirements }, { data: owners }, { data: siteUsers }] =
    await Promise.all([
      areaIds.length
        ? supabase.from("area_requirements").select("*").in("area_id", areaIds)
        : Promise.resolve({ data: [] as AreaRequirement[] }),
      supabase.from("area_requirement_owners").select("*"),
      // Owner picker: only users who belong to this site
      admin
        .from("user_sites")
        .select("profile_id, profiles!inner(*)")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .returns<{ profile_id: string; profiles: Profile }[]>(),
    ]);

  const profiles =
    (siteUsers ?? [])
      .map((row) => row.profiles)
      .filter((p) => p.is_active)
      .sort((a, b) =>
        (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email),
      );

  return (
    <div className="px-8 py-8 max-w-7xl">
      <h1 className="text-2xl font-semibold mb-1">Requirements</h1>
      <p className="text-sm text-muted-foreground mb-6">
        The applicability matrix that drives weekly task generation at this
        site.
      </p>
      <RequirementsAdmin
        areas={(areas ?? []) as Area[]}
        inspectionTypes={(types ?? []) as InspectionType[]}
        requirements={(requirements ?? []) as AreaRequirement[]}
        owners={(owners ?? []) as AreaRequirementOwner[]}
        profiles={profiles}
      />
    </div>
  );
}
