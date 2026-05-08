import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/admin-guard";
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
  await requireAdmin();
  const supabase = await createClient();

  const [
    { data: areas },
    { data: types },
    { data: requirements },
    { data: owners },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from("areas")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("inspection_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("area_requirements").select("*"),
    supabase.from("area_requirement_owners").select("*"),
    supabase.from("profiles").select("*").order("full_name"),
  ]);

  return (
    <div className="px-8 py-8 max-w-7xl">
      <h1 className="text-2xl font-semibold mb-1">Requirements</h1>
      <p className="text-sm text-muted-foreground mb-6">
        The applicability matrix that drives weekly task generation.
      </p>
      <RequirementsAdmin
        areas={(areas ?? []) as Area[]}
        inspectionTypes={(types ?? []) as InspectionType[]}
        requirements={(requirements ?? []) as AreaRequirement[]}
        owners={(owners ?? []) as AreaRequirementOwner[]}
        profiles={(profiles ?? []) as Profile[]}
      />
    </div>
  );
}
