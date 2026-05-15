import { Resend } from "resend";

let _client: Resend | null = null;

export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

export const FROM_EMAIL = "cadence@pesldar.com";
export const DEFAULT_SENDER_NAME = "Cadence";

export function formatFromAddress(
  senderName: string | null | undefined,
): string {
  const name = (senderName ?? "").trim() || DEFAULT_SENDER_NAME;
  return `${name} <${FROM_EMAIL}>`;
}

export function formatWeekRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(s)} – ${fmt(e)}`;
}

export function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://cadence.example.com";
}

/** Resend's default free-tier rate limit is 2 req/s; paid is 10 req/s.
 *  We pace individual sends at 250ms (~4 req/s) to stay safely under
 *  both ceilings while keeping a 25-recipient site under 10s total. */
export const RESEND_SEND_INTERVAL_MS = 250;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
