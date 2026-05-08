import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { Profile } from "@/lib/types";

export async function requireAdmin(): Promise<Profile> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("[requireAdmin] getUser failed:", {
      message: userError.message,
      status: userError.status,
    });
    redirect("/login");
  }
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (profileError) {
    console.error("[requireAdmin] profile lookup failed:", {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
      userId: user.id,
    });
    redirect("/login");
  }
  if (!profile || profile.role !== "admin") redirect("/dashboard");
  return profile;
}
