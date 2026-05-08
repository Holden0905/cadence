"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export type AuthActionResult = { error: string } | { ok: true };

export async function signInWithPasswordAction(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { error: error.message };
  redirect("/dashboard");
}
