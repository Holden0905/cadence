import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sendNudgesForSite } from "@/lib/email/send-nudges-for-site";
import type { Site } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel cron: Wednesday 14:00 UTC (9:00 AM CT). */
export async function GET(request: NextRequest) {
  const unauthorized = verifyCronAuth(request);
  if (unauthorized) return unauthorized;

  const admin = createAdminClient();
  const { data: sites, error } = await admin
    .from("sites")
    .select("*")
    .eq("is_active", true);

  if (error) {
    console.error("[cron/send-nudge] list sites failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const results = [];
  for (const site of (sites ?? []) as Site[]) {
    try {
      results.push(await sendNudgesForSite(site));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/send-nudge] site ${site.name} failed:`, message);
      results.push({ site: site.name, status: "error", error: message });
    }
  }

  return NextResponse.json({ ok: true, sites: results });
}
