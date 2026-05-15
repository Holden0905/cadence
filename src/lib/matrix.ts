import type {
  Area,
  AreaRequirement,
  AreaRequirementOwner,
  DocumentRow,
  DocumentTask,
  InspectionTask,
  InspectionType,
  Profile,
  TaskStatus,
} from "@/lib/types";

export type CellState =
  | { kind: "na" }
  | {
      kind: "task";
      task: InspectionTask;
      requirement: AreaRequirement;
      documents: DocumentRow[];
      owners: { profile: Profile; role: "primary" | "backup" }[];
    };

export type MatrixData = {
  areas: Area[];
  inspectionTypes: InspectionType[];
  cells: Map<string, CellState>;
};

const cellKey = (areaId: string, typeId: string) => `${areaId}::${typeId}`;

export function buildMatrix(args: {
  areas: Area[];
  inspectionTypes: InspectionType[];
  requirements: AreaRequirement[];
  tasks: InspectionTask[];
  documents: DocumentRow[];
  documentTasks: DocumentTask[];
  owners: AreaRequirementOwner[];
  profiles: Profile[];
}): MatrixData {
  const {
    areas,
    inspectionTypes,
    requirements,
    tasks,
    documents,
    documentTasks,
    owners,
    profiles,
  } = args;

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const docById = new Map(documents.map((d) => [d.id, d]));
  const docsByTask = new Map<string, DocumentRow[]>();
  for (const link of documentTasks) {
    const doc = docById.get(link.document_id);
    if (!doc) continue;
    const arr = docsByTask.get(link.task_id) ?? [];
    arr.push(doc);
    docsByTask.set(link.task_id, arr);
  }
  const ownersByReq = new Map<
    string,
    { profile: Profile; role: "primary" | "backup" }[]
  >();
  for (const o of owners) {
    const profile = profileById.get(o.profile_id);
    if (!profile) continue;
    const arr = ownersByReq.get(o.area_requirement_id) ?? [];
    arr.push({ profile, role: o.owner_role });
    ownersByReq.set(o.area_requirement_id, arr);
  }

  const cells = new Map<string, CellState>();
  for (const a of areas) {
    for (const t of inspectionTypes) {
      cells.set(cellKey(a.id, t.id), { kind: "na" });
    }
  }

  for (const task of tasks) {
    const req = reqById.get(task.area_requirement_id);
    if (!req) continue;
    cells.set(cellKey(req.area_id, req.inspection_type_id), {
      kind: "task",
      task,
      requirement: req,
      documents: docsByTask.get(task.id) ?? [],
      owners: ownersByReq.get(req.id) ?? [],
    });
  }

  return { areas, inspectionTypes, cells };
}

export function getCell(
  matrix: MatrixData,
  areaId: string,
  typeId: string,
): CellState {
  return matrix.cells.get(cellKey(areaId, typeId)) ?? { kind: "na" };
}

export function statusCounts(matrix: MatrixData) {
  let pending = 0;
  let submitted = 0;
  let approved = 0;
  let total = 0;
  for (const cell of matrix.cells.values()) {
    if (cell.kind !== "task") continue;
    total++;
    if (cell.task.status === "pending") pending++;
    else if (cell.task.status === "submitted") submitted++;
    else if (cell.task.status === "approved") approved++;
  }
  return { pending, submitted, approved, total };
}

export function statusLabel(status: TaskStatus): string {
  if (status === "pending") return "Pending";
  if (status === "submitted") return "Submitted";
  return "Approved";
}
