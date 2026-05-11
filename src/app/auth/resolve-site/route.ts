import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUserMemberships, setCurrentSiteId } from "@/lib/site-context";

/**
 * Determines where a signed-in user should land based on their site
 * memberships:
 *   - 1 site  → set cookie and go to /dashboard
 *   - 2+ sites → /select-site (picker)
 *   - 0 sites → /select-site (no-access state)
 * Route handler so we can write cookies (server components can't).
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const memberships = await getUserMemberships(user.id);

  if (memberships.length === 1) {
    await setCurrentSiteId(memberships[0].site.id);
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  return NextResponse.redirect(`${origin}/select-site`);
}
