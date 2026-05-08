import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { Profile } from "@/lib/types";

export async function requireAdmin(): Promise<Profile> {
  const supabase = await createClient();

  // Middleware already validated the session; use getSession (cookie read)
  // to avoid a redundant GoTrue round-trip that races token refresh.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single<Profile>();

  if (error) {
    console.error("[requireAdmin] profile lookup failed:", error);
    redirect("/login");
  }
  if (!profile || profile.role !== "admin") redirect("/dashboard");
  return profile;
}
