import { createClient } from "@/utils/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InspectionMatrix } from "@/components/inspection-matrix";
import { TestSummaryButton } from "@/components/test-summary-button";
import { TestNudgeButton } from "@/components/test-nudge-button";
import { formatWeekRange, daysRemaining } from "@/lib/dates";
import { requireSiteContext } from "@/lib/admin-guard";
import { isSuperAdminRole } from "@/lib/site-context";
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

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { siteId, role } = await requireSiteContext();
  const supabase = await createClient();
  const isSuper = isSuperAdminRole(role);

  const { data: cycle } = await supabase
    .from("inspection_cycles")
    .select("*")
    .eq("site_id", siteId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle<InspectionCycle>();

  if (!cycle) {
    return (
      <div className="px-8 py-10 max-w-5xl">
        <h1 className="text-2xl font-semibold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          No inspection cycles exist yet for this site. The next one will be
          auto-generated on Sunday at 6 AM CT.
        </p>
      </div>
    );
  }

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
      .eq("site_id", siteId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("inspection_types")
      .select("*")
      .eq("site_id", siteId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("area_requirements").select("*").eq("is_active", true),
    supabase.from("inspection_tasks").select("*").eq("cycle_id", cycle.id),
    supabase.from("area_requirement_owners").select("*"),
    supabase.from("profiles").select("*"),
  ]);

  const taskList = (tasks ?? []) as InspectionTask[];
  const taskIds = taskList.map((t) => t.id);
  let documents: DocumentRow[] = [];
  if (taskIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("*")
      .in("task_id", taskIds);
    documents = (docs ?? []) as DocumentRow[];
  }

  const total = taskList.length;
  const approved = taskList.filter((t) => t.status === "approved").length;
  const submitted = taskList.filter((t) => t.status === "submitted").length;
  const pending = taskList.filter((t) => t.status === "pending").length;
  const completePct = total === 0 ? 0 : Math.round((approved / total) * 100);

  return (
    <div className="px-8 py-8 max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Inspection Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Week of {formatWeekRange(cycle.week_start, cycle.week_end)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isSuper && (
            <>
              <TestNudgeButton />
              <TestSummaryButton />
            </>
          )}
          <Badge
            variant={cycle.status === "active" ? "default" : "secondary"}
            className="capitalize"
          >
            {cycle.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-green-700 dark:text-green-400">
              {approved}
              <span className="text-sm text-muted-foreground font-normal">
                /{total}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Submitted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-yellow-700 dark:text-yellow-400">
              {submitted}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-red-700 dark:text-red-400">
              {pending}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Days remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {daysRemaining(cycle.week_end)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {approved} of {total} approved
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            {completePct}%
          </p>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-green-600 dark:bg-green-500 transition-all"
            style={{ width: `${completePct}%` }}
          />
        </div>
      </div>

      <Legend />

      <InspectionMatrix
        cycleId={cycle.id}
        areas={(areas ?? []) as Area[]}
        inspectionTypes={(types ?? []) as InspectionType[]}
        requirements={(requirements ?? []) as AreaRequirement[]}
        tasks={taskList}
        documents={documents}
        owners={(owners ?? []) as AreaRequirementOwner[]}
        profiles={(profiles ?? []) as Profile[]}
        userRole={role}
      />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground flex-wrap">
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded bg-green-100 border border-green-300" />
        Approved
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded bg-yellow-100 border border-yellow-300" />
        Submitted (pending review)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded bg-red-100 border border-red-300" />
        Not yet uploaded
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded bg-muted border" />
        Not applicable
      </span>
    </div>
  );
}
