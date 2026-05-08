import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatWeekRange } from "@/lib/dates";
import type { InspectionCycle, InspectionTask } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();

  const { data: cycles } = await supabase
    .from("inspection_cycles")
    .select("*")
    .order("week_start", { ascending: false });

  const cycleList = (cycles ?? []) as InspectionCycle[];
  const cycleIds = cycleList.map((c) => c.id);

  let tasksByCycle = new Map<
    string,
    { total: number; approved: number; submitted: number; pending: number }
  >();
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
    }, new Map<string, { total: number; approved: number; submitted: number; pending: number }>());
  }

  return (
    <div className="px-8 py-8 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-1">History</h1>
      <p className="text-sm text-muted-foreground mb-6">
        All past and current inspection cycles.
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
            return (
              <Link
                key={c.id}
                href={`/history/${c.id}`}
                className="block"
              >
                <Card className="p-4 hover:bg-muted/30 transition cursor-pointer">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium">
                        Week of {formatWeekRange(c.week_start, c.week_end)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {stats.approved} of {stats.total} approved · {pct}%
                        complete
                      </p>
                    </div>
                    <Badge
                      variant={c.status === "active" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {c.status}
                    </Badge>
                  </div>
                  <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-green-600 dark:bg-green-500"
                      style={{ width: `${pct}%` }}
                    />
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
