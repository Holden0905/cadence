"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSiteAdmin } from "@/lib/admin-guard";
import { sendRejectionEmail } from "@/lib/email/send-rejection-email";
import type { InspectionTask } from "@/lib/types";

export type RejectTaskResult =
  | {
      ok: true;
      emailed: number;
      emailSkipped: number;
      emailFailed: number;
      emailReason?: string;
    }
  | { error: string };

export async function rejectTaskAction(args: {
  taskId: string;
  reason?: string;
}): Promise<RejectTaskResult> {
  const { siteId, profile } = await requireSiteAdmin();
  const admin = createAdminClient();

  // Verify the task exists, is currently submitted, and belongs to the
  // current site (via cycle.site_id). This prevents cross-site rejection.
  const { data: task } = await admin
    .from("inspection_tasks")
    .select("id, status, cycle_id, inspection_cycles!inner(site_id)")
    .eq("id", args.taskId)
    .maybeSingle<
      Pick<InspectionTask, "id" | "status" | "cycle_id"> & {
        inspection_cycles: { site_id: string };
      }
    >();

  if (!task) return { error: "Task not found" };
  if (task.inspection_cycles.site_id !== siteId)
    return { error: "Task does not belong to the current site" };
  if (task.status !== "submitted")
    return { error: `Task is ${task.status}, not submitted` };

  const { error: updateError } = await admin
    .from("inspection_tasks")
    .update({
      status: "pending",
      submitted_by: null,
      submitted_at: null,
    })
    .eq("id", args.taskId);

  if (updateError) return { error: updateError.message };

  const emailResult = await sendRejectionEmail({
    taskId: args.taskId,
    siteId,
    reason: args.reason,
    rejectedBy: profile,
  });

  revalidatePath("/review");
  revalidatePath("/dashboard");

  if ("error" in emailResult) {
    // Task was reverted to pending, but the email failed. Surface the
    // problem to the admin so they can follow up manually.
    return {
      ok: true,
      emailed: 0,
      emailSkipped: 0,
      emailFailed: 1,
      emailReason: emailResult.error,
    };
  }

  return {
    ok: true,
    emailed: emailResult.sent,
    emailSkipped: emailResult.skipped,
    emailFailed: emailResult.failures.length,
    emailReason: emailResult.reason,
  };
}
