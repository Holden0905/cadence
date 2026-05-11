import { Resend } from "resend";

let _client: Resend | null = null;

export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

export const FROM_ADDRESS =
  process.env.CADENCE_FROM_ADDRESS ?? "Cadence <cadence@pesldar.com>";

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
  // TEMPORARY: hardcoded production URL while we debug why
  // NEXT_PUBLIC_APP_URL isn't resolving in Vercel.
  // TODO: restore the env-var chain (NEXT_PUBLIC_APP_URL → VERCEL_URL
  // → fallback) once the email links are confirmed working.
  return "https://cadence-woad-two.vercel.app";
}
