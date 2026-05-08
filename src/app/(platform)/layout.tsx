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

  // Middleware already validated the session via getUser() and refreshed
  // tokens if needed. We use getSession() here (cookie read, no network
  // round-trip) to avoid a second GoTrue call that was racing token
  // refresh and intermittently returning null.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single<Profile>();

  if (profileError) {
    console.error("[platform layout] profile lookup failed:", profileError);
    redirect("/login");
  }
  if (!profile) {
    console.error(
      "[platform layout] no profile row for user",
      session.user.id,
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
