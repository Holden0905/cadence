"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export type SignupActionResult =
  | { error: string }
  | { ok: true; needsConfirmation: false }
  | { ok: true; needsConfirmation: true };

export async function signUpAction(
  fullName: string,
  email: string,
  password: string,
): Promise<SignupActionResult> {
  const supabase = await createClient();

  const requestHeaders = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${requestHeaders.get("host")}`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: fullName },
    },
  });

  if (error) return { error: error.message };

  if (data.session) {
    redirect("/dashboard");
  }

  return { ok: true, needsConfirmation: true };
}
