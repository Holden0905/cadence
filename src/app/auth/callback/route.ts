import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  getUserMemberships,
  setCurrentSiteId,
} from "@/lib/site-context";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // If the caller asked us to land on a specific in-app path
      // (e.g. /auth/update-password from a recovery link), honor it
      // instead of running the site-resolution flow.
      if (next && next.startsWith("/")) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      const memberships = await getUserMemberships(data.user.id);
      if (memberships.length === 1) {
        await setCurrentSiteId(memberships[0].site.id);
        return NextResponse.redirect(`${origin}/dashboard`);
      }
      return NextResponse.redirect(`${origin}/select-site`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
