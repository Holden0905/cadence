import { inspect } from "node:util";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { Sidebar } from "@/components/sidebar";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error(
      "[platform layout] getUser failed:",
      inspect(userError, { showHidden: true, depth: 4, getters: true }),
    );
    redirect("/login");
  }
  if (!user) redirect("/login");

  // Use service-role client for the profile lookup. We've already
  // validated the user via getUser() above, so reading their own
  // profile by the verified user.id with elevated privileges is safe
  // and avoids any RLS / JWT-propagation flakiness on the user-scoped
  // client right after sign-in.
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (profileError) {
    console.error(
      "[platform layout] profile lookup failed:",
      inspect(profileError, { showHidden: true, depth: 4, getters: true }),
    );
    redirect("/login");
  }
  if (!profile) {
    console.error(
      "[platform layout] no profile row exists for user",
      user.id,
      "— the handle_new_user trigger may not have fired",
    );
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
