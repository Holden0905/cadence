import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Sidebar } from "@/components/sidebar";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // getUser() validates the JWT against GoTrue and refreshes it in-memory
  // if needed. We need this (not getSession) so subsequent .from() calls
  // use a fresh access token — otherwise an expired token gets sent to
  // PostgREST, the request falls back to `anon`, and RLS hides the
  // profile row.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("[platform layout] getUser failed:", {
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
    console.error("[platform layout] profile lookup failed:", {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
      userId: user.id,
    });
    redirect("/login");
  }
  if (!profile) {
    console.error(
      "[platform layout] no profile row visible for user",
      user.id,
      "— RLS may be blocking or trigger didn't fire",
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
