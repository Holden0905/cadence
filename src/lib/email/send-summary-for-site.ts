import { createAdminClient } from "@/utils/supabase/admin";
import {
  FROM_ADDRESS,
  formatWeekRange,
  getResend,
} from "@/lib/email/resend-client";
import type {
  Area,
  AreaRequirement,
  InspectionCycle,
  InspectionTask,
  InspectionType,
  Recipient,
  Site,
} from "@/lib/types";

export type SummaryResult = {
  site: string;
  status: "sent" | "skipped" | "no-active-cycle" | "no-recipients";
  recipients?: number;
  reason?: string;
  emailId?: string;
};

function renderMatrix(
  areas: Area[],
  types: InspectionType[],
  reqByAreaType: Map<string, AreaRequirement>,
  taskByReq: Map<string, InspectionTask>,
): string {
  const headerCells = types
    .map(
      (t) =>
        `<th style="padding:8px 10px;border:1px solid #e5e7eb;background:#f3f4f6;font-size:12px;font-weight:600;text-align:center;color:#374151;" title="${t.name}">${t.abbreviation}</th>`,
    )
    .join("");

  const rows = areas
    .map((a) => {
      const cells = types
        .map((t) => {
          const req = reqByAreaType.get(`${a.id}::${t.id}`);
          if (!req)
            return `<td style="padding:10px;border:1px solid #e5e7eb;background:#f3f4f6;text-align:center;color:#9ca3af;">—</td>`;
          const task = taskByReq.get(req.id);
          if (!task)
            return `<td style="padding:10px;border:1px solid #e5e7eb;background:#f3f4f6;text-align:center;color:#9ca3af;">—</td>`;
          if (task.status === "approved")
            return `<td style="padding:10px;border:1px solid #e5e7eb;background:#dcfce7;text-align:center;color:#15803d;font-weight:600;">✓</td>`;
          if (task.status === "submitted")
            return `<td style="padding:10px;border:1px solid #e5e7eb;background:#fef9c3;text-align:center;color:#854d0e;font-weight:600;">⧳</td>`;
          return `<td style="padding:10px;border:1px solid #e5e7eb;background:#fee2e2;text-align:center;color:#b91c1c;font-weight:600;">✗</td>`;
        })
        .join("");
      return `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;font-weight:500;background:#fff;">${a.name}</td>${cells}</tr>`;
    })
    .join("");

  return `
    <table style="border-collapse:collapse;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <thead>
        <tr>
          <th style="padding:8px 12px;border:1px solid #e5e7eb;background:#f3f4f6;font-size:12px;font-weight:600;text-align:left;color:#374151;">Area</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export async function sendSummaryForSite(
  site: Site,
  opts: { subjectPrefix?: string } = {},
): Promise<SummaryResult> {
  const admin = createAdminClient();
  const resend = getResend();

  const { data: cycle } = await admin
    .from("inspection_cycles")
    .select("*")
    .eq("site_id", site.id)
    .eq("status", "active")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle<InspectionCycle>();

  if (!cycle) return { site: site.name, status: "no-active-cycle" };

  const [areaRes, typeRes, reqRes, taskRes, recipRes] = await Promise.all([
    admin
      .from("areas")
      .select("*")
      .eq("site_id", site.id)
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("inspection_types")
      .select("*")
      .eq("site_id", site.id)
      .eq("is_active", true)
      .order("sort_order"),
    admin.from("area_requirements").select("*").eq("is_active", true),
    admin.from("inspection_tasks").select("*").eq("cycle_id", cycle.id),
    admin
      .from("recipients")
      .select("*")
      .eq("site_id", site.id)
      .eq("is_active", true),
  ]);

  const areas = (areaRes.data ?? []) as Area[];
  const types = (typeRes.data ?? []) as InspectionType[];
  const requirements = (reqRes.data ?? []) as AreaRequirement[];
  const tasks = (taskRes.data ?? []) as InspectionTask[];
  const recipients = (recipRes.data ?? []) as Recipient[];

  if (recipients.length === 0)
    return { site: site.name, status: "no-recipients" };

  const areaIds = new Set(areas.map((a) => a.id));
  const siteRequirements = requirements.filter((r) => areaIds.has(r.area_id));

  const reqByAreaType = new Map<string, AreaRequirement>();
  for (const r of siteRequirements)
    reqByAreaType.set(`${r.area_id}::${r.inspection_type_id}`, r);
  const taskByReq = new Map<string, InspectionTask>();
  for (const t of tasks) taskByReq.set(t.area_requirement_id, t);

  const total = tasks.length;
  const approved = tasks.filter((t) => t.status === "approved").length;
  const submitted = tasks.filter((t) => t.status === "submitted").length;
  const pending = tasks.filter((t) => t.status === "pending").length;

  const weekRange = formatWeekRange(cycle.week_start, cycle.week_end);
  const matrixHtml = renderMatrix(areas, types, reqByAreaType, taskByReq);

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:900px;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 8px;">Cadence — Weekly Inspection Status</h2>
      <p style="margin:0 0 4px;color:#4b5563;"><strong>${site.name}</strong>${site.location ? " — " + site.location : ""}</p>
      <p style="margin:0 0 24px;color:#4b5563;">Week of <strong>${weekRange}</strong></p>
      <p style="margin:0 0 16px;">
        <strong>${approved}</strong> of <strong>${total}</strong> inspections approved.
        ${submitted > 0 ? `<span style="color:#854d0e;">⧳ ${submitted} submitted, awaiting review.</span>` : ""}
        ${pending > 0 ? `<span style="color:#b91c1c;">✗ ${pending} pending.</span>` : ""}
      </p>
      ${matrixHtml}
      <p style="margin-top:24px;font-size:12px;color:#6b7280;">
        Legend: <span style="color:#15803d;">✓ Approved</span> ·
        <span style="color:#854d0e;">⧳ Submitted, pending review</span> ·
        <span style="color:#b91c1c;">✗ Not yet uploaded</span> ·
        <span style="color:#9ca3af;">— Not applicable</span>
      </p>
      <p style="color:#6b7280;font-size:12px;margin-top:16px;">— Cadence Automated System<br/>${site.name}${site.location ? " — " + site.location : ""}</p>
    </div>
  `;

  const subject = `${opts.subjectPrefix ?? ""}Cadence — Weekly Inspection Status for ${site.name} — Week of ${weekRange}`;
  const toAddresses = recipients.map((r) => r.email);

  if (!resend) {
    return {
      site: site.name,
      status: "skipped",
      reason: "RESEND_API_KEY not set",
      recipients: toAddresses.length,
    };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: toAddresses,
    subject,
    html,
  });

  if (error) {
    return {
      site: site.name,
      status: "skipped",
      reason: error.message,
      recipients: toAddresses.length,
    };
  }

  return {
    site: site.name,
    status: "sent",
    recipients: toAddresses.length,
    emailId: data?.id,
  };
}
