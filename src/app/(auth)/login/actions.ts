"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  getUserMemberships,
  setCurrentSiteId,
} from "@/lib/site-context";

export type AuthActionResult = { error: string } | { ok: true };

export async function signInWithPasswordAction(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { error: error.message };

  // Auto-select site if user belongs to exactly one
  if (data.user) {
    const memberships = await getUserMemberships(data.user.id);
    if (memberships.length === 1) {
      await setCurrentSiteId(memberships[0].site.id);
      redirect("/dashboard");
    }
  }

  redirect("/select-site");
}
