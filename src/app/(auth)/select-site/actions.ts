"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserSiteRole, setCurrentSiteId } from "@/lib/site-context";

export type SelectSiteResult = { error: string } | { ok: true };

export async function selectSiteAction(
  siteId: string,
): Promise<SelectSiteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const role = await getUserSiteRole(user.id, siteId);
  if (!role) return { error: "You don't have access to that site" };

  await setCurrentSiteId(siteId);
  redirect("/dashboard");
}
