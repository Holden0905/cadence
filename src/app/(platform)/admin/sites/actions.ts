"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type SiteActionResult = { error: string } | { ok: true };

async function requireSuperAdminInline(): Promise<
  { ok: true } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: anyMembership } = await admin
    .from("user_sites")
    .select("site_id, role")
    .eq("profile_id", user.id)
    .eq("role", "super_admin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<{ site_id: string; role: string }>();

  if (!anyMembership) return { error: "Super admin only" };
  return { ok: true };
}

function normalizeSenderName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "Cadence") return null;
  return trimmed;
}

export async function createSiteAction(args: {
  name: string;
  location: string;
  emailSenderName: string;
}): Promise<SiteActionResult> {
  const guard = await requireSuperAdminInline();
  if ("error" in guard) return guard;

  const admin = createAdminClient();
  const { error } = await admin.from("sites").insert({
    name: args.name.trim(),
    location: args.location.trim() || null,
    email_sender_name: normalizeSenderName(args.emailSenderName),
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/sites");
  return { ok: true };
}

export async function updateSiteAction(args: {
  id: string;
  name: string;
  location: string;
  emailSenderName: string;
}): Promise<SiteActionResult> {
  const guard = await requireSuperAdminInline();
  if ("error" in guard) return guard;

  const admin = createAdminClient();
  const { error } = await admin
    .from("sites")
    .update({
      name: args.name.trim(),
      location: args.location.trim() || null,
      email_sender_name: normalizeSenderName(args.emailSenderName),
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.id);
  if (error) return { error: error.message };

  revalidatePath("/admin/sites");
  return { ok: true };
}

export async function toggleSiteActiveAction(
  id: string,
  isActive: boolean,
): Promise<SiteActionResult> {
  const guard = await requireSuperAdminInline();
  if ("error" in guard) return guard;

  const admin = createAdminClient();
  const { error } = await admin
    .from("sites")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/sites");
  return { ok: true };
}
