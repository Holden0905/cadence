import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { getUserMemberships } from "@/lib/site-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SitePicker } from "./site-picker";

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
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="items-center text-center">
          <Image
            src="/cadence-logo.png"
            alt="Cadence"
            width={64}
            height={64}
            priority
            className="mb-2"
          />
          <CardTitle className="text-2xl">No site access</CardTitle>
          <CardDescription>
            Your account doesn&apos;t belong to any active sites yet. A site
            administrator needs to add you. Once they do, sign in again.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Single-membership users are auto-resolved by /auth/resolve-site
  // before reaching this page; if they did land here (manual navigation),
  // fall through to the picker — they'll see one option.
  return (
    <Card className="w-full max-w-md shadow-sm">
      <CardHeader className="items-center text-center">
        <Image
          src="/cadence-logo.png"
          alt="Cadence"
          width={56}
          height={56}
          priority
          className="mb-2"
        />
        <CardTitle className="text-2xl">Select a site</CardTitle>
        <CardDescription>
          You have access to {memberships.length} site
          {memberships.length === 1 ? "" : "s"}. Pick one to continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SitePicker memberships={memberships} />
      </CardContent>
    </Card>
  );
}
