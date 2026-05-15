import { type NextRequest } from "next/server";
import { PassThrough, Readable } from "node:stream";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  Area,
  AreaRequirement,
  DocumentRow,
  DocumentTask,
  InspectionCycle,
  InspectionTask,
  InspectionType,
  Site,
  SiteRole,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function sanitize(s: string): string {
  return s
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.\-+]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .substring(0, 100);
}

function extractExt(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx === -1) return "";
  return filename.substring(idx + 1).toLowerCase();
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const cycleId = url.searchParams.get("cycleId");
  if (!cycleId) return jsonError(400, "cycleId is required");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Not authenticated");

  const admin = createAdminClient();

  const { data: cycle } = await admin
    .from("inspection_cycles")
    .select("*")
    .eq("id", cycleId)
    .maybeSingle<InspectionCycle>();
  if (!cycle) return jsonError(404, "Cycle not found");

  const { data: roleAtSite } = await admin
    .from("user_sites")
    .select("role")
    .eq("profile_id", user.id)
    .eq("site_id", cycle.site_id)
    .eq("is_active", true)
    .maybeSingle<{ role: SiteRole }>();

  const role = roleAtSite?.role;
  if (role !== "site_admin" && role !== "super_admin") {
    return jsonError(403, "Forbidden");
  }

  const { data: site } = await admin
    .from("sites")
    .select("*")
    .eq("id", cycle.site_id)
    .maybeSingle<Site>();
  if (!site) return jsonError(404, "Site not found");

  const { data: tasksRaw } = await admin
    .from("inspection_tasks")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("status", "approved");
  const approvedTasks = (tasksRaw ?? []) as InspectionTask[];
  if (approvedTasks.length === 0) {
    return jsonError(404, "No approved inspections for this cycle");
  }

  const taskIds = approvedTasks.map((t) => t.id);

  const { data: junctionRaw } = await admin
    .from("document_tasks")
    .select("*")
    .in("task_id", taskIds);
  const junctions = (junctionRaw ?? []) as DocumentTask[];
  if (junctions.length === 0) {
    return jsonError(404, "No documents linked to approved inspections");
  }

  const docIds = Array.from(new Set(junctions.map((j) => j.document_id)));
  const { data: docsRaw } = await admin
    .from("documents")
    .select("*")
    .in("id", docIds);
  const documents = (docsRaw ?? []) as DocumentRow[];

  const reqIds = Array.from(
    new Set(approvedTasks.map((t) => t.area_requirement_id)),
  );
  const { data: reqsRaw } = await admin
    .from("area_requirements")
    .select("*")
    .in("id", reqIds);
  const requirements = (reqsRaw ?? []) as AreaRequirement[];

  const areaIds = Array.from(new Set(requirements.map((r) => r.area_id)));
  const typeIds = Array.from(
    new Set(requirements.map((r) => r.inspection_type_id)),
  );
  const [areasRes, typesRes] = await Promise.all([
    admin.from("areas").select("*").in("id", areaIds),
    admin.from("inspection_types").select("*").in("id", typeIds),
  ]);
  const areas = (areasRes.data ?? []) as Area[];
  const types = (typesRes.data ?? []) as InspectionType[];

  const taskById = new Map(approvedTasks.map((t) => [t.id, t]));
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const docById = new Map(documents.map((d) => [d.id, d]));

  // (documentId, areaId) → { document, area, types[] }. A doc that
  // covers multiple inspection types in the same area produces one
  // entry with all types collected. A doc spanning multiple areas
  // produces one entry per area, each with that area's types only.
  type Group = {
    document: DocumentRow;
    area: Area;
    types: InspectionType[];
  };
  const groupMap = new Map<string, Group>();

  for (const j of junctions) {
    const task = taskById.get(j.task_id);
    if (!task) continue;
    const req = reqById.get(task.area_requirement_id);
    if (!req) continue;
    const area = areaById.get(req.area_id);
    const type = typeById.get(req.inspection_type_id);
    const doc = docById.get(j.document_id);
    if (!area || !type || !doc) continue;

    const key = `${doc.id}::${area.id}`;
    const existing = groupMap.get(key);
    if (existing) {
      if (!existing.types.some((t) => t.id === type.id)) {
        existing.types.push(type);
      }
    } else {
      groupMap.set(key, { document: doc, area, types: [type] });
    }
  }

  if (groupMap.size === 0) {
    return jsonError(404, "No documents to bundle");
  }

  // archiver is CommonJS and Turbopack rejects the ESM default-import
  // interop, so load it dynamically here.
  const archiverModule = await import("archiver");
  const archiver = archiverModule.default;
  const archive = archiver("zip", { zlib: { level: 6 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  archive.on("warning", (err) => {
    console.warn("[download-cycle] archive warning:", err);
  });
  archive.on("error", (err) => {
    console.error("[download-cycle] archive error:", err);
    passthrough.destroy(err);
  });

  // Build the zip in the background; the response streams as bytes
  // become available. Any download or append error truncates the
  // stream so the client sees a partial response rather than hanging.
  const build = (async () => {
    const usedNamesByFolder = new Map<string, Set<string>>();

    for (const group of groupMap.values()) {
      const ext = extractExt(group.document.file_name);
      const typeNames = group.types
        .map((t) => sanitize(t.abbreviation || t.name))
        .filter(Boolean)
        .sort();
      const baseName = `${typeNames.join("+")}_${cycle.week_start}`;
      const areaFolder = sanitize(group.area.name) || "Unnamed_Area";

      let finalName = ext ? `${baseName}.${ext}` : baseName;
      const used =
        usedNamesByFolder.get(areaFolder) ?? new Set<string>();
      let n = 0;
      while (used.has(finalName)) {
        n++;
        finalName = ext ? `${baseName}_${n}.${ext}` : `${baseName}_${n}`;
      }
      used.add(finalName);
      usedNamesByFolder.set(areaFolder, used);

      const zipPath = `${areaFolder}/${finalName}`;

      try {
        const { data: blob, error: dlError } = await admin.storage
          .from("inspection-documents")
          .download(group.document.file_path);
        if (dlError || !blob) {
          console.error(
            `[download-cycle] storage download failed for ${group.document.file_path}:`,
            dlError,
          );
          continue;
        }
        const arrayBuffer = await blob.arrayBuffer();
        archive.append(Buffer.from(arrayBuffer), { name: zipPath });
      } catch (err) {
        console.error(
          `[download-cycle] error appending ${group.document.file_path}:`,
          err,
        );
      }
    }

    await archive.finalize();
  })();

  build.catch((err) => {
    console.error("[download-cycle] build pipeline failed:", err);
    archive.abort();
    passthrough.destroy(err);
  });

  const zipFilename = `${sanitize(site.name)}_Week_${cycle.week_start}.zip`;
  const webStream = Readable.toWeb(passthrough) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
      "Cache-Control": "no-store",
    },
  });
}
