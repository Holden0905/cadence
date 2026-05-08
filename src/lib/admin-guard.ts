import { inspect } from "node:util";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { Profile } from "@/lib/types";

export async function requireAdmin(): Promise<Profile> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error(
      "[requireAdmin] getUser failed:",
      inspect(userError, { showHidden: true, depth: 4, getters: true }),
    );
    redirect("/login");
  }
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (profileError) {
    console.error(
      "[requireAdmin] profile lookup failed:",
      inspect(profileError, { showHidden: true, depth: 4, getters: true }),
    );
    redirect("/login");
  }
  if (!profile || profile.role !== "admin") redirect("/dashboard");
  return profile;
}
