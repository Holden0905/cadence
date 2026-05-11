import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { getUserMemberships } from "@/lib/site-context";
import { SiteCardList } from "./site-cards";

export const dynamic = "force-dynamic";

export default async function SelectSitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const memberships = await getUserMemberships(user.id);

  if (memberships.length === 0) {
    return (
      <div className="w-full max-w-md text-center space-y-4">
        <Image
          src="/cadence-logo.png"
          alt="Cadence"
          width={64}
          height={64}
          priority
          className="mx-auto"
        />
        <h1 className="text-2xl font-semibold">No site access</h1>
        <p className="text-sm text-muted-foreground">
          Your account doesn&apos;t belong to any active sites yet. A site
          administrator needs to add you. Once they do, sign in again.
        </p>
      </div>
    );
  }

  const singleSite = memberships.length === 1;

  return (
    <div className="w-full max-w-2xl">
      <div className="text-center mb-8">
        <Image
          src="/cadence-logo.png"
          alt="Cadence"
          width={56}
          height={56}
          priority
          className="mx-auto mb-3"
        />
        <h1 className="text-2xl font-semibold">
          {singleSite ? "Continue to Cadence" : "Select a site"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {singleSite
            ? "Click your site to continue."
            : `You have access to ${memberships.length} sites. Choose one to continue.`}
        </p>
      </div>
      <SiteCardList memberships={memberships} />
    </div>
  );
}
