import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Area,
  AreaRequirement,
  AreaRequirementOwner,
  DocumentRow,
  InspectionCycle,
  InspectionTask,
  InspectionType,
  Profile,
} from "@/lib/types";
import { buildMatrix, type MatrixData } from "@/lib/matrix";

export async function fetchActiveCycle(
  supabase: SupabaseClient,
): Promise<InspectionCycle | null> {
  const { data } = await supabase
    .from("inspection_cycles")
    .select("*")
    .eq("status", "active")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle<InspectionCycle>();
  return data;
}

export async function fetchCycleMatrix(
  supabase: SupabaseClient,
  cycleId: string,
): Promise<MatrixData> {
  const [
    { data: areas },
    { data: types },
    { data: requirements },
    { data: tasks },
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
    supabase.from("area_requirements").select("*").eq("is_active", true),
    supabase.from("inspection_tasks").select("*").eq("cycle_id", cycleId),
    supabase.from("area_requirement_owners").select("*"),
    supabase.from("profiles").select("*"),
  ]);

  const taskIds = (tasks ?? []).map((t: InspectionTask) => t.id);
  let documents: DocumentRow[] = [];
  if (taskIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("*")
      .in("task_id", taskIds);
    documents = (docs ?? []) as DocumentRow[];
  }

  return buildMatrix({
    areas: (areas ?? []) as Area[],
    inspectionTypes: (types ?? []) as InspectionType[],
    requirements: (requirements ?? []) as AreaRequirement[],
    tasks: (tasks ?? []) as InspectionTask[],
    documents,
    owners: (owners ?? []) as AreaRequirementOwner[],
    profiles: (profiles ?? []) as Profile[],
  });
}
