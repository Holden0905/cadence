import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Area,
  AreaRequirement,
  AreaRequirementOwner,
  DocumentRow,
  DocumentTask,
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

/**
 * Resolve all documents linked to the given task IDs via the
 * document_tasks junction. Returns both arrays so callers can hand
 * them to buildMatrix (or assemble their own maps).
 */
export async function fetchDocumentsForTasks(
  supabase: SupabaseClient,
  taskIds: string[],
): Promise<{ documents: DocumentRow[]; documentTasks: DocumentTask[] }> {
  if (taskIds.length === 0) return { documents: [], documentTasks: [] };

  const { data: junction } = await supabase
    .from("document_tasks")
    .select("*")
    .in("task_id", taskIds);
  const documentTasks = (junction ?? []) as DocumentTask[];

  const documentIds = Array.from(
    new Set(documentTasks.map((j) => j.document_id)),
  );
  if (documentIds.length === 0) return { documents: [], documentTasks };

  const { data: docs } = await supabase
    .from("documents")
    .select("*")
    .in("id", documentIds);

  return { documents: (docs ?? []) as DocumentRow[], documentTasks };
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

  const taskList = (tasks ?? []) as InspectionTask[];
  const { documents, documentTasks } = await fetchDocumentsForTasks(
    supabase,
    taskList.map((t) => t.id),
  );

  return buildMatrix({
    areas: (areas ?? []) as Area[],
    inspectionTypes: (types ?? []) as InspectionType[],
    requirements: (requirements ?? []) as AreaRequirement[],
    tasks: taskList,
    documents,
    documentTasks,
    owners: (owners ?? []) as AreaRequirementOwner[],
    profiles: (profiles ?? []) as Profile[],
  });
}
