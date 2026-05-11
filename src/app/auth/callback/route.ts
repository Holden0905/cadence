import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  getUserMemberships,
  setCurrentSiteId,
} from "@/lib/site-context";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
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
