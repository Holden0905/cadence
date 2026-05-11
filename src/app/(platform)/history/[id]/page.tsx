import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, History as HistoryIcon, CheckCircle2 } from "lucide-react";
import { InspectionMatrix } from "@/components/inspection-matrix";
import { CompletionReportButton } from "@/components/completion-report-button";
import { formatWeekRange, daysRemaining } from "@/lib/dates";
import { requireSiteContext } from "@/lib/admin-guard";
import { isAdminRole } from "@/lib/site-context";
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

function isPastWeek(weekEndIso: string): boolean {
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekEndIso + "T00:00:00");
  return weekEnd < todayMidnight;
}

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { siteId, role } = await requireSiteContext();
  const supabase = await createClient();

  const { data: cycle } = await supabase
    .from("inspection_cycles")
    .select("*")
    .eq("id", id)
    .single<InspectionCycle>();

  if (!cycle) notFound();
  if (cycle.site_id !== siteId) redirect("/history");

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
      .order("sort_order"),
    supabase
      .from("inspection_types")
      .select("*")
      .eq("site_id", siteId)
      .order("sort_order"),
    supabase.from("area_requirements").select("*"),
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
  const past = isPastWeek(cycle.week_end);
  const fullyApproved = total > 0 && pending === 0 && submitted === 0;
  const canSendCompletion = fullyApproved && isAdminRole(role);

  return (
    <div className="px-8 py-8 max-w-7xl">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/history">
            <ArrowLeft className="size-4" />
            Back to history
          </Link>
        </Button>
      </div>

      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold">
              Week of {formatWeekRange(cycle.week_start, cycle.week_end)}
            </h1>
            {past && (
              <Badge variant="secondary" className="gap-1">
                <HistoryIcon className="size-3" />
                Past week
              </Badge>
            )}
            {fullyApproved && (
              <Badge className="gap-1 bg-green-600 hover:bg-green-600 text-white">
                <CheckCircle2 className="size-3" />
                100% approved
              </Badge>
            )}
          </div>
          {past && (
            <p className="text-xs text-muted-foreground mt-2 max-w-xl">
              This is a past inspection week. You can still upload documents
              and admins can still approve submissions — useful for late
              entries or corrections.
            </p>
          )}
        </div>
        {canSendCompletion && <CompletionReportButton cycleId={cycle.id} />}
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
              {past ? "Status" : "Days remaining"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {past ? "Completed" : daysRemaining(cycle.week_end)}
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
