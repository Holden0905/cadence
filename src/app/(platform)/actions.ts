"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  clearCurrentSiteId,
  getUserSiteRole,
  setCurrentSiteId,
} from "@/lib/site-context";

export type SwitchSiteResult = { error: string } | { ok: true };

export async function switchSiteAction(
  siteId: string,
): Promise<SwitchSiteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const role = await getUserSiteRole(user.id, siteId);
  if (!role) return { error: "You don't have access to that site" };

  await setCurrentSiteId(siteId);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearCurrentSiteId();
  redirect("/login");
}
