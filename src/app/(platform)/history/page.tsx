import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatWeekRange } from "@/lib/dates";
import { requireSiteContext } from "@/lib/admin-guard";
import type { InspectionCycle, InspectionTask } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { siteId } = await requireSiteContext();
  const supabase = await createClient();

  const { data: cycles } = await supabase
    .from("inspection_cycles")
    .select("*")
    .eq("site_id", siteId)
    .order("week_start", { ascending: false });

  const cycleList = (cycles ?? []) as InspectionCycle[];
  const cycleIds = cycleList.map((c) => c.id);

  type Stats = {
    total: number;
    approved: number;
    submitted: number;
    pending: number;
  };
  let tasksByCycle = new Map<string, Stats>();
  if (cycleIds.length > 0) {
    const { data: tasks } = await supabase
      .from("inspection_tasks")
      .select("cycle_id, status")
      .in("cycle_id", cycleIds);

    const list = (tasks ?? []) as Pick<InspectionTask, "cycle_id" | "status">[];
    tasksByCycle = list.reduce((acc, t) => {
      const cur = acc.get(t.cycle_id) ?? {
        total: 0,
        approved: 0,
        submitted: 0,
        pending: 0,
      };
      cur.total += 1;
      if (t.status === "approved") cur.approved += 1;
      else if (t.status === "submitted") cur.submitted += 1;
      else cur.pending += 1;
      acc.set(t.cycle_id, cur);
      return acc;
    }, new Map<string, Stats>());
  }

  return (
    <div className="px-8 py-8 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-1">History</h1>
      <p className="text-sm text-muted-foreground mb-6">
        All past and current inspection cycles for this site.
      </p>

      {cycleList.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No inspection cycles yet.
        </Card>
      ) : (
        <div className="space-y-3">
          {cycleList.map((c) => {
            const stats = tasksByCycle.get(c.id) ?? {
              total: 0,
              approved: 0,
              submitted: 0,
              pending: 0,
            };
            const pct =
              stats.total === 0
                ? 0
                : Math.round((stats.approved / stats.total) * 100);
            const fullyApproved =
              stats.total > 0 && stats.approved === stats.total;
            return (
              <Link
                key={c.id}
                href={`/history/${c.id}`}
                className="block"
              >
                <Card className="p-4 hover:bg-muted/30 transition cursor-pointer">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium">
                        Week of {formatWeekRange(c.week_start, c.week_end)}
                      </p>
                      <div className="mt-1 flex items-center gap-3 flex-wrap text-xs">
                        <span className="text-green-700 dark:text-green-400 font-medium">
                          ✓ {stats.approved} approved
                        </span>
                        <span className="text-yellow-700 dark:text-yellow-400 font-medium">
                          ⧳ {stats.submitted} submitted
                        </span>
                        <span className="text-red-700 dark:text-red-400 font-medium">
                          ✗ {stats.pending} pending
                        </span>
                        <span className="text-muted-foreground">
                          ·  {stats.total} total
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {fullyApproved && (
                        <Badge className="bg-green-600 hover:bg-green-600 text-white">
                          100%
                        </Badge>
                      )}
                      <Badge
                        variant={
                          c.status === "active" ? "default" : "secondary"
                        }
                        className="capitalize"
                      >
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-green-600 dark:bg-green-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums w-10 text-right">
                      {pct}%
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
