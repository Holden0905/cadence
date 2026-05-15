"use server";

import { revalidatePath } from "next/cache";
import { requireSiteAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendSummaryForSite } from "@/lib/email/send-summary-for-site";
import type {
  CycleStatus,
  InspectionCycle,
  InspectionTask,
  Site,
} from "@/lib/types";

export type UpdateCycleStatusResult = { ok: true } | { error: string };

export async function updateCycleStatusAction(args: {
  cycleId: string;
  status: CycleStatus;
}): Promise<UpdateCycleStatusResult> {
  const { siteId } = await requireSiteAdmin();
  const admin = createAdminClient();

  const { data: cycle } = await admin
    .from("inspection_cycles")
    .select("id, site_id")
    .eq("id", args.cycleId)
    .maybeSingle<{ id: string; site_id: string }>();
  if (!cycle) return { error: "Cycle not found" };
  if (cycle.site_id !== siteId)
    return { error: "Cycle belongs to a different site" };

  const patch: {
    status: CycleStatus;
    completed_at?: string;
  } = { status: args.status };
  // Stamp completion time only when transitioning into 'completed'.
  // Other transitions don't clear it — preserves the audit trail if
  // the cycle is later moved to archived.
  if (args.status === "completed") {
    patch.completed_at = new Date().toISOString();
  }

  const { error } = await admin
    .from("inspection_cycles")
    .update(patch)
    .eq("id", args.cycleId);
  if (error) return { error: error.message };

  revalidatePath(`/history/${args.cycleId}`);
  revalidatePath("/history");
  revalidatePath("/dashboard");
  return { ok: true };
}

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
