import { NextResponse, type NextRequest } from "next/server";

/**
 * Verifies a Vercel cron request. Vercel sends
 *   Authorization: Bearer <CRON_SECRET>
 * for every cron-triggered request. Reject everything else.
 *
 * Returns a NextResponse if the request is unauthorized; otherwise null
 * (caller proceeds).
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on the server" },
      { status: 500 },
    );
  }

  const header = request.headers.get("authorization");
  const expected = `Bearer ${secret}`;
  if (header !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
