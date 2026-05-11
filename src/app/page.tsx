import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCurrentSiteId, getUserSiteRole } from "@/lib/site-context";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const siteId = await getCurrentSiteId();
  if (!siteId) redirect("/auth/resolve-site");

  const role = await getUserSiteRole(user.id, siteId);
  if (!role) redirect("/auth/resolve-site");

  redirect("/dashboard");
}
