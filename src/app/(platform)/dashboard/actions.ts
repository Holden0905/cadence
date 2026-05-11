"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type DeleteDocumentResult = { ok: true } | { error: string };

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

  const { data: doc, error: docError } = await admin
    .from("documents")
    .select("id, file_path, uploaded_by")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) return { error: docError.message };
  if (!doc) return { error: "Document not found" };

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  const isOwner = doc.uploaded_by === user.id;
  if (!isAdmin && !isOwner) {
    return { error: "You can only delete documents you uploaded" };
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
