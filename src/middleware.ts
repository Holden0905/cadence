import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // /api/cron/* is excluded because those routes authenticate via the
    // CRON_SECRET header rather than a browser session — letting the
    // middleware run causes a 307 redirect to /login for Vercel's cron
    // requests.
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
