import { createAdminClient } from "@/utils/supabase/admin";
import {
  FROM_ADDRESS,
  appBaseUrl,
  formatWeekRange,
  getResend,
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

export type NudgeResult = {
  site: string;
  status: "skipped" | "sent" | "no-active-cycle" | "no-pending";
  emails?: { to: string; status: string }[];
  reason?: string;
};

export async function sendNudgesForSite(site: Site): Promise<NudgeResult> {
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

  const { data: pending } = await admin
    .from("inspection_tasks")
    .select("*")
    .eq("cycle_id", cycle.id)
    .eq("status", "pending");

  const pendingTasks = (pending ?? []) as InspectionTask[];
  if (pendingTasks.length === 0)
    return { site: site.name, status: "no-pending" };

  const reqIds = Array.from(
    new Set(pendingTasks.map((t) => t.area_requirement_id)),
  );
  const [reqRes, ownerRes, areaRes, typeRes] = await Promise.all([
    admin.from("area_requirements").select("*").in("id", reqIds),
    admin
      .from("area_requirement_owners")
      .select("*")
      .in("area_requirement_id", reqIds),
    admin.from("areas").select("*").eq("site_id", site.id),
    admin.from("inspection_types").select("*").eq("site_id", site.id),
  ]);

  const requirements = (reqRes.data ?? []) as AreaRequirement[];
  const owners = (ownerRes.data ?? []) as AreaRequirementOwner[];
  const areas = (areaRes.data ?? []) as Area[];
  const types = (typeRes.data ?? []) as InspectionType[];

  const profileIds = Array.from(new Set(owners.map((o) => o.profile_id)));
  let profiles: Profile[] = [];
  if (profileIds.length) {
    const { data: pf } = await admin
      .from("profiles")
      .select("*")
      .in("id", profileIds)
      .eq("is_active", true);
    profiles = (pf ?? []) as Profile[];
  }
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  type Group = {
    primary: Profile;
    backups: Set<string>;
    tasks: { areaName: string; typeName: string }[];
  };
  const groups = new Map<string, Group>();

  for (const task of pendingTasks) {
    const req = reqById.get(task.area_requirement_id);
    if (!req) continue;
    const area = areaById.get(req.area_id);
    const type = typeById.get(req.inspection_type_id);
    if (!area || !type) continue;

    const reqOwners = owners.filter((o) => o.area_requirement_id === req.id);
    const primaries = reqOwners.filter((o) => o.owner_role === "primary");
    const backups = reqOwners.filter((o) => o.owner_role === "backup");

    for (const po of primaries) {
      const primary = profileById.get(po.profile_id);
      if (!primary) continue;
      const group = groups.get(primary.id) ?? {
        primary,
        backups: new Set<string>(),
        tasks: [] as { areaName: string; typeName: string }[],
      };
      group.tasks.push({ areaName: area.name, typeName: type.name });
      for (const bo of backups) {
        const backup = profileById.get(bo.profile_id);
        if (backup && backup.id !== primary.id) group.backups.add(backup.email);
      }
      groups.set(primary.id, group);
    }
  }

  if (groups.size === 0) {
    return {
      site: site.name,
      status: "no-pending",
      reason: "pending tasks exist but no primary owners assigned",
    };
  }

  if (!resend) {
    return {
      site: site.name,
      status: "skipped",
      reason: "RESEND_API_KEY not set",
    };
  }

  const weekRange = formatWeekRange(cycle.week_start, cycle.week_end);
  const appUrl = appBaseUrl();
  const results: { to: string; status: string }[] = [];

  for (const group of groups.values()) {
    const taskListHtml = group.tasks
      .map(
        (t) => `<li><strong>${t.areaName}</strong> — ${t.typeName}</li>`,
      )
      .join("");
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;padding:20px;color:#1a1a1a;">
        <p>Hi ${group.primary.full_name || group.primary.email},</p>
        <p>The following inspections are still pending at <strong>${site.name}</strong> for the week of <strong>${weekRange}</strong>:</p>
        <ul style="line-height:1.7;">${taskListHtml}</ul>
        <p>Please upload your inspection documents at:<br/><a href="${appUrl}/dashboard" style="color:#2563eb;">${appUrl}/dashboard</a></p>
        <p style="color:#6b7280;font-size:12px;margin-top:32px;">— Cadence Automated System<br/>${site.name}${site.location ? " — " + site.location : ""}</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [group.primary.email],
      cc: group.backups.size ? Array.from(group.backups) : undefined,
      subject: `Cadence — Outstanding Inspections at ${site.name} for Week of ${weekRange}`,
      html,
    });
    results.push({
      to: group.primary.email,
      status: error ? `error: ${error.message}` : `sent (${data?.id ?? "?"})`,
    });
  }

  return { site: site.name, status: "sent", emails: results };
}
