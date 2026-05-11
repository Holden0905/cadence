"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireSuperAdmin } from "@/lib/admin-guard";
import { sendSummaryForSite } from "@/lib/email/send-summary-for-site";
import { sendNudgesForSite } from "@/lib/email/send-nudges-for-site";
import type { Site, SiteRole } from "@/lib/types";

export type DeleteDocumentResult = { ok: true } | { error: string };
export type TestSummaryResult =
  | {
      ok: true;
      recipients: number;
      status: string;
      reason?: string;
      succeeded?: number;
      failed?: number;
    }
  | { error: string };
export type TestNudgeResult =
  | {
      ok: true;
      sentTo: number;
      status: string;
      reason?: string;
      succeeded?: number;
      failed?: number;
    }
  | { error: string };

export async function deleteDocumentAction(
  documentId: string,
): Promise<DeleteDocumentResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Look up doc + its site via task → cycle
  const { data: doc, error: docError } = await admin
    .from("documents")
    .select(
      "id, file_path, uploaded_by, task_id, inspection_tasks!inner(cycle_id, inspection_cycles!inner(site_id))",
    )
    .eq("id", documentId)
    .maybeSingle<{
      id: string;
      file_path: string;
      uploaded_by: string;
      task_id: string;
      inspection_tasks: {
        cycle_id: string;
        inspection_cycles: { site_id: string };
      };
    }>();

  if (docError) return { error: docError.message };
  if (!doc) return { error: "Document not found" };

  const docSiteId = doc.inspection_tasks?.inspection_cycles?.site_id;
  if (!docSiteId) return { error: "Could not resolve document's site" };

  const isOwner = doc.uploaded_by === user.id;

  let canDelete = isOwner;

  if (!canDelete) {
    // site_admin or super_admin at the doc's site
    const { data: roleAtSite } = await admin
      .from("user_sites")
      .select("role")
      .eq("profile_id", user.id)
      .eq("site_id", docSiteId)
      .eq("is_active", true)
      .maybeSingle<{ role: SiteRole }>();

    if (
      roleAtSite?.role === "site_admin" ||
      roleAtSite?.role === "super_admin"
    ) {
      canDelete = true;
    }
  }

  if (!canDelete) {
    // super_admin anywhere (cross-site)
    const { data: superAnywhere } = await admin
      .from("user_sites")
      .select("id")
      .eq("profile_id", user.id)
      .eq("role", "super_admin")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (superAnywhere) canDelete = true;
  }

  if (!canDelete) {
    return {
      error: "You can only delete documents you uploaded",
    };
  }

  const { error: storageError } = await admin.storage
    .from("inspection-documents")
    .remove([doc.file_path]);

  if (storageError) {
    console.error(
      "[deleteDocument] storage remove failed (continuing to delete row):",
      storageError,
    );
  }

  const { error: rowError } = await admin
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (rowError) return { error: rowError.message };

  // DB trigger reset_task_after_document_delete handles task status revert.
  revalidatePath("/dashboard");
  revalidatePath("/review");
  return { ok: true };
}

/**
 * Super-admin only: send the weekly summary email for the current site
 * immediately, with a "[TEST]" subject prefix so recipients know it
 * isn't the Thursday automation.
 */
export async function sendTestSummaryAction(): Promise<TestSummaryResult> {
  const { siteId } = await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: site } = await admin
    .from("sites")
    .select("*")
    .eq("id", siteId)
    .maybeSingle<Site>();
  if (!site) return { error: "Current site not found" };

  const result = await sendSummaryForSite(site, {
    subjectPrefix: "[TEST] ",
  });

  if (result.status === "no-active-cycle")
    return { error: "No active cycle for this site yet" };
  if (result.status === "no-recipients")
    return { error: "No active recipients configured for this site" };

  return {
    ok: true,
    recipients: result.recipients ?? 0,
    status: result.status,
    reason: result.reason,
    succeeded: result.succeeded,
    failed: result.failed,
  };
}

/**
 * Super-admin only: fire the Wednesday nudge logic for the current
 * site immediately, with "[TEST]" in the subject so primary/backup
 * owners know it isn't the scheduled run.
 */
export async function sendTestNudgeAction(): Promise<TestNudgeResult> {
  const { siteId } = await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: site } = await admin
    .from("sites")
    .select("*")
    .eq("id", siteId)
    .maybeSingle<Site>();
  if (!site) return { error: "Current site not found" };

  const result = await sendNudgesForSite(site, { subjectPrefix: "[TEST] " });

  if (result.status === "no-active-cycle")
    return { error: "No active cycle for this site yet" };
  if (result.status === "no-pending")
    return {
      error: result.reason
        ? `No nudges to send — ${result.reason}`
        : "No pending tasks for this cycle — nothing to nudge",
    };

  const sentTo = result.emails?.length ?? 0;
  const succeeded = (result.emails ?? []).filter((e) => e.ok).length;
  const failed = sentTo - succeeded;
  return {
    ok: true,
    sentTo,
    status: result.status,
    reason: result.reason,
    succeeded,
    failed,
  };
}
