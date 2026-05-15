import { createClient } from "@/utils/supabase/server";
import { ReviewList } from "@/components/review-list";
import { requireSiteAdmin } from "@/lib/admin-guard";
import { fetchDocumentsForTasks } from "@/lib/queries";
import type {
  Area,
  AreaRequirement,
  DocumentRow,
  InspectionCycle,
  InspectionTask,
  InspectionType,
  Profile,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function isPastWeek(weekEndIso: string): boolean {
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekEndIso + "T00:00:00");
  return weekEnd < todayMidnight;
}

export default async function ReviewPage() {
  const { siteId } = await requireSiteAdmin();
  const supabase = await createClient();

  // All cycles for this site (we'll need each cycle's week range for the
  // item label)
  const { data: cycles } = await supabase
    .from("inspection_cycles")
    .select("*")
    .eq("site_id", siteId);

  const cycleList = (cycles ?? []) as InspectionCycle[];
  if (cycleList.length === 0) {
    return (
      <div className="px-8 py-10">
        <h1 className="text-2xl font-semibold mb-2">Review</h1>
        <p className="text-muted-foreground">No cycles for this site yet.</p>
      </div>
    );
  }
  const cycleIds = cycleList.map((c) => c.id);
  const cycleById = new Map(cycleList.map((c) => [c.id, c]));

  // Submitted tasks across ALL cycles of this site (past + current),
  // most recently submitted first.
  const { data: submittedTasks } = await supabase
    .from("inspection_tasks")
    .select("*")
    .in("cycle_id", cycleIds)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });

  const taskList = (submittedTasks ?? []) as InspectionTask[];

  const requirementIds = Array.from(
    new Set(taskList.map((t) => t.area_requirement_id)),
  );
  const submitterIds = Array.from(
    new Set(taskList.map((t) => t.submitted_by).filter(Boolean) as string[]),
  );
  const taskIds = taskList.map((t) => t.id);

  const [reqRes, areaRes, typeRes, profileRes, docResult] = await Promise.all([
    requirementIds.length
      ? supabase
          .from("area_requirements")
          .select("*")
          .in("id", requirementIds)
      : Promise.resolve({ data: [] as AreaRequirement[] }),
    supabase.from("areas").select("*").eq("site_id", siteId),
    supabase.from("inspection_types").select("*").eq("site_id", siteId),
    submitterIds.length
      ? supabase.from("profiles").select("*").in("id", submitterIds)
      : Promise.resolve({ data: [] as Profile[] }),
    fetchDocumentsForTasks(supabase, taskIds),
  ]);

  const requirements = (reqRes.data ?? []) as AreaRequirement[];
  const areas = (areaRes.data ?? []) as Area[];
  const types = (typeRes.data ?? []) as InspectionType[];
  const submitters = (profileRes.data ?? []) as Profile[];
  const { documents, documentTasks } = docResult;

  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const submitterById = new Map(submitters.map((p) => [p.id, p]));
  const docById = new Map(documents.map((d) => [d.id, d]));
  const docsByTask = new Map<string, DocumentRow[]>();
  for (const link of documentTasks) {
    const doc = docById.get(link.document_id);
    if (!doc) continue;
    const arr = docsByTask.get(link.task_id) ?? [];
    arr.push(doc);
    docsByTask.set(link.task_id, arr);
  }

  const items = taskList
    .map((task) => {
      const req = reqById.get(task.area_requirement_id);
      const cycle = cycleById.get(task.cycle_id);
      if (!req || !cycle) return null;
      const area = areaById.get(req.area_id);
      const type = typeById.get(req.inspection_type_id);
      if (!area || !type) return null;
      return {
        task,
        area,
        inspectionType: type,
        submitter: task.submitted_by
          ? submitterById.get(task.submitted_by) ?? null
          : null,
        documents: docsByTask.get(task.id) ?? [],
        cycle,
        isPastWeek: isPastWeek(cycle.week_end),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const pastCount = items.filter((i) => i.isPastWeek).length;

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Review submissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {items.length} awaiting review across all weeks
          {pastCount > 0 && (
            <> · {pastCount} from past weeks</>
          )}
        </p>
      </div>

      <ReviewList items={items} />
    </div>
  );
}
