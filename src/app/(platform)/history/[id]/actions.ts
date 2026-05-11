"use server";

import { requireSiteAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendSummaryForSite } from "@/lib/email/send-summary-for-site";
import type { InspectionCycle, InspectionTask, Site } from "@/lib/types";

export type CompletionReportResult =
  | {
      ok: true;
      recipients: number;
      succeeded?: number;
      failed?: number;
      status: string;
      reason?: string;
    }
  | { error: string };

export async function sendCompletionReportAction(
  cycleId: string,
): Promise<CompletionReportResult> {
  const { siteId } = await requireSiteAdmin();
  const admin = createAdminClient();

  const { data: cycle } = await admin
    .from("inspection_cycles")
    .select("*")
    .eq("id", cycleId)
    .maybeSingle<InspectionCycle>();

  if (!cycle) return { error: "Cycle not found" };
  if (cycle.site_id !== siteId)
    return { error: "Cycle belongs to a different site" };

  // Verify all tasks for the cycle are approved
  const { data: tasks } = await admin
    .from("inspection_tasks")
    .select("status")
    .eq("cycle_id", cycle.id);
  const taskList = (tasks ?? []) as Pick<InspectionTask, "status">[];
  if (taskList.length === 0)
    return { error: "No inspections in this cycle" };
  const unapproved = taskList.filter((t) => t.status !== "approved").length;
  if (unapproved > 0) {
    return {
      error: `${unapproved} inspection${unapproved === 1 ? "" : "s"} not yet approved — can't send completion report`,
    };
  }

  const { data: site } = await admin
    .from("sites")
    .select("*")
    .eq("id", siteId)
    .maybeSingle<Site>();
  if (!site) return { error: "Site not found" };

  const result = await sendSummaryForSite(site, {
    cycle,
    kind: "completion",
  });

  if (result.status === "no-recipients")
    return { error: "No active recipients configured for this site" };

  return {
    ok: true,
    recipients: result.recipients ?? 0,
    succeeded: result.succeeded,
    failed: result.failed,
    status: result.status,
    reason: result.reason,
  };
}
