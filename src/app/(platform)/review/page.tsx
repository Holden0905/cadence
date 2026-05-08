import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ReviewList } from "@/components/review-list";
import { formatWeekRange } from "@/lib/dates";
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

export default async function ReviewPage() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single<Profile>();
  if (profileError) {
    console.error("[review page] profile lookup failed:", profileError);
    redirect("/login");
  }
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const { data: cycle } = await supabase
    .from("inspection_cycles")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle<InspectionCycle>();

  if (!cycle) {
    return (
      <div className="px-8 py-10">
        <h1 className="text-2xl font-semibold mb-2">Review</h1>
        <p className="text-muted-foreground">No active cycle.</p>
      </div>
    );
  }

  const { data: submittedTasks } = await supabase
    .from("inspection_tasks")
    .select("*")
    .eq("cycle_id", cycle.id)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  const taskList = (submittedTasks ?? []) as InspectionTask[];

  const requirementIds = Array.from(
    new Set(taskList.map((t) => t.area_requirement_id)),
  );
  const submitterIds = Array.from(
    new Set(taskList.map((t) => t.submitted_by).filter(Boolean) as string[]),
  );
  const taskIds = taskList.map((t) => t.id);

  const [reqRes, areaRes, typeRes, profileRes, docRes] = await Promise.all([
    requirementIds.length
      ? supabase
          .from("area_requirements")
          .select("*")
          .in("id", requirementIds)
      : Promise.resolve({ data: [] as AreaRequirement[] }),
    supabase.from("areas").select("*"),
    supabase.from("inspection_types").select("*"),
    submitterIds.length
      ? supabase.from("profiles").select("*").in("id", submitterIds)
      : Promise.resolve({ data: [] as Profile[] }),
    taskIds.length
      ? supabase.from("documents").select("*").in("task_id", taskIds)
      : Promise.resolve({ data: [] as DocumentRow[] }),
  ]);

  const requirements = (reqRes.data ?? []) as AreaRequirement[];
  const areas = (areaRes.data ?? []) as Area[];
  const types = (typeRes.data ?? []) as InspectionType[];
  const submitters = (profileRes.data ?? []) as Profile[];
  const documents = (docRes.data ?? []) as DocumentRow[];

  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const submitterById = new Map(submitters.map((p) => [p.id, p]));
  const docsByTask = new Map<string, DocumentRow[]>();
  for (const d of documents) {
    const arr = docsByTask.get(d.task_id) ?? [];
    arr.push(d);
    docsByTask.set(d.task_id, arr);
  }

  const items = taskList
    .map((task) => {
      const req = reqById.get(task.area_requirement_id);
      if (!req) return null;
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
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Review submissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Week of {formatWeekRange(cycle.week_start, cycle.week_end)} · {items.length}{" "}
          awaiting review
        </p>
      </div>

      <ReviewList items={items} />
    </div>
  );
}
