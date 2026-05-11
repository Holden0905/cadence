import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel cron: Sunday 11:00 UTC (6:00 AM CT). Calls the existing
 * create_weekly_cycle() Postgres function which iterates over all
 * active sites and creates the week's cycle + tasks (idempotent —
 * if the cycle already exists for a site this week, the function
 * skips it). The pg_cron job remains scheduled too as a redundant
 * primary; calling twice is safe.
 */
export async function GET(request: NextRequest) {
  const unauthorized = verifyCronAuth(request);
  if (unauthorized) return unauthorized;

  const admin = createAdminClient();
  const { error } = await admin.rpc("create_weekly_cycle");

  if (error) {
    console.error("[cron/create-cycle] rpc failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
