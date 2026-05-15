import { createAdminClient } from "@/utils/supabase/admin";
import {
  RESEND_SEND_INTERVAL_MS,
  appBaseUrl,
  formatFromAddress,
  formatWeekRange,
  getResend,
  sleep,
} from "@/lib/email/resend-client";
import type {
  Area,
  AreaRequirement,
  AreaRequirementOwner,
  InspectionCycle,
  InspectionTask,
  InspectionType,
  Profile,
  Site,
} from "@/lib/types";

export type RejectionEmailResult =
  | {
      ok: true;
      sent: number;
      skipped: number;
      failures: { email: string; error: string }[];
      reason?: string;
    }
  | { error: string };

export async function sendRejectionEmail(args: {
  taskId: string;
  siteId: string;
  reason?: string | null;
  rejectedBy?: Profile | null;
}): Promise<RejectionEmailResult> {
  const admin = createAdminClient();
  const resend = getResend();

  const { data: task } = await admin
    .from("inspection_tasks")
    .select("*")
    .eq("id", args.taskId)
    .maybeSingle<InspectionTask>();
  if (!task) return { error: "Task not found" };

  const [siteRes, cycleRes, reqRes] = await Promise.all([
    admin
      .from("sites")
      .select("*")
      .eq("id", args.siteId)
      .maybeSingle<Site>(),
    admin
      .from("inspection_cycles")
      .select("*")
      .eq("id", task.cycle_id)
      .maybeSingle<InspectionCycle>(),
    admin
      .from("area_requirements")
      .select("*")
      .eq("id", task.area_requirement_id)
      .maybeSingle<AreaRequirement>(),
  ]);

  const site = siteRes.data;
  const cycle = cycleRes.data;
  const requirement = reqRes.data;
  if (!site) return { error: "Site not found" };
  if (!cycle) return { error: "Cycle not found" };
  if (!requirement) return { error: "Area requirement not found" };

  const [areaRes, typeRes, ownerRes] = await Promise.all([
    admin
      .from("areas")
      .select("*")
      .eq("id", requirement.area_id)
      .maybeSingle<Area>(),
    admin
      .from("inspection_types")
      .select("*")
      .eq("id", requirement.inspection_type_id)
      .maybeSingle<InspectionType>(),
    admin
      .from("area_requirement_owners")
      .select("*")
      .eq("area_requirement_id", requirement.id)
      .in("owner_role", ["primary", "backup"]),
  ]);

  const area = areaRes.data;
  const type = typeRes.data;
  const owners = (ownerRes.data ?? []) as AreaRequirementOwner[];
  if (!area || !type)
    return { error: "Area or inspection type not found for this task" };

  if (owners.length === 0) {
    return {
      ok: true,
      sent: 0,
      skipped: 0,
      failures: [],
      reason: "No primary or backup owner assigned",
    };
  }

  const ownerProfileIds = Array.from(
    new Set(owners.map((o) => o.profile_id)),
  );

  const { data: profiles } = await admin
    .from("profiles")
    .select("*")
    .in("id", ownerProfileIds)
    .eq("is_active", true);

  const recipients = (profiles ?? []) as Profile[];
  if (recipients.length === 0) {
    return {
      ok: true,
      sent: 0,
      skipped: 0,
      failures: [],
      reason: "Owner profile(s) inactive or missing",
    };
  }

  if (!resend) {
    return {
      ok: true,
      sent: 0,
      skipped: recipients.length,
      failures: [],
      reason: "RESEND_API_KEY not set",
    };
  }

  const weekRange = formatWeekRange(cycle.week_start, cycle.week_end);
  const appUrl = appBaseUrl();
  const subject = `Cadence — Inspection Rejected: ${area.name} / ${type.name}`;
  const fromAddress = formatFromAddress(site.email_sender_name);
  const reason = (args.reason ?? "").trim();
  const rejectedByName =
    args.rejectedBy?.full_name?.trim() || args.rejectedBy?.email || null;

  let sent = 0;
  const failures: { email: string; error: string }[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const owner = recipients[i];
    if (i > 0) await sleep(RESEND_SEND_INTERVAL_MS);

    const html = buildBody({
      greetingName: owner.full_name || owner.email,
      site,
      areaName: area.name,
      typeName: type.name,
      typeAbbr: type.abbreviation,
      weekRange,
      reason,
      rejectedByName,
      appUrl,
    });

    try {
      const { error } = await resend.emails.send({
        from: fromAddress,
        to: [owner.email],
        subject,
        html,
      });
      if (error) {
        console.error(
          `[send-rejection] ${site.name} → ${owner.email} failed:`,
          error.message,
        );
        failures.push({ email: owner.email, error: error.message });
      } else {
        sent++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[send-rejection] ${site.name} → ${owner.email} threw:`,
        message,
      );
      failures.push({ email: owner.email, error: message });
    }
  }

  return { ok: true, sent, skipped: 0, failures };
}

function buildBody(args: {
  greetingName: string;
  site: Site;
  areaName: string;
  typeName: string;
  typeAbbr: string;
  weekRange: string;
  reason: string;
  rejectedByName: string | null;
  appUrl: string;
}): string {
  const reasonBlock = args.reason
    ? `
        <div style="margin:16px 0;padding:12px 14px;background:#fef9c3;border-left:3px solid #ca8a04;border-radius:4px;">
          <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#854d0e;font-weight:600;">Reason for rejection</p>
          <p style="margin:0;color:#1a1a1a;white-space:pre-wrap;">${escapeHtml(args.reason)}</p>
        </div>
      `
    : "";

  const rejectedByLine = args.rejectedByName
    ? `<p style="font-size:12px;color:#6b7280;margin:4px 0 0;">Rejected by <strong>${escapeHtml(args.rejectedByName)}</strong>.</p>`
    : "";

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;padding:20px;color:#1a1a1a;">
      <p>Hi ${escapeHtml(args.greetingName)},</p>
      <p>
        Your submission for the inspection below was <strong>rejected</strong>
        and the task has been reopened. Please review the reason (if provided),
        correct the issue, and re-upload.
      </p>
      <div style="margin:16px 0;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
        <p style="margin:0;font-size:14px;">
          <strong>${escapeHtml(args.areaName)}</strong> — ${escapeHtml(args.typeName)}
          <span style="color:#6b7280;">(${escapeHtml(args.typeAbbr)})</span>
        </p>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">
          ${escapeHtml(args.site.name)}${args.site.location ? " — " + escapeHtml(args.site.location) : ""} · Week of <strong>${escapeHtml(args.weekRange)}</strong>
        </p>
        ${rejectedByLine}
      </div>
      ${reasonBlock}
      <p style="margin:20px 0;">
        <a href="${args.appUrl}/dashboard" style="display:inline-block;padding:10px 18px;background:#c8102e;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Resubmit in Cadence</a>
      </p>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">— Cadence Automated System<br/>${escapeHtml(args.site.name)}${args.site.location ? " — " + escapeHtml(args.site.location) : ""}</p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
