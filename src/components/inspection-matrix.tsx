"use client";

import { useMemo, useState } from "react";
import { Check, Clock, X, Minus } from "lucide-react";
import {
  UploadModal,
  type PendingTaskOption,
} from "@/components/upload-modal";
import { DocumentPreviewModal } from "@/components/document-preview-modal";
import { cn } from "@/lib/utils";
import { buildMatrix, getCell, statusLabel } from "@/lib/matrix";
import type {
  Area,
  AreaRequirement,
  AreaRequirementOwner,
  DocumentRow,
  DocumentTask,
  InspectionTask,
  InspectionType,
  Profile,
  SiteRole,
  TaskStatus,
} from "@/lib/types";

type Props = {
  cycleId: string;
  areas: Area[];
  inspectionTypes: InspectionType[];
  requirements: AreaRequirement[];
  tasks: InspectionTask[];
  documents: DocumentRow[];
  documentTasks: DocumentTask[];
  owners: AreaRequirementOwner[];
  profiles: Profile[];
  userRole: SiteRole;
  /** Area IDs the current user is assigned to (primary or backup on any
   *  requirement). Used to partition the matrix for inspectors. */
  ownedAreaIds?: string[];
};

export function InspectionMatrix({
  cycleId,
  areas,
  inspectionTypes,
  requirements,
  tasks,
  documents,
  documentTasks,
  owners,
  profiles,
  userRole,
  ownedAreaIds = [],
}: Props) {
  const matrix = useMemo(
    () =>
      buildMatrix({
        areas,
        inspectionTypes,
        requirements,
        tasks,
        documents,
        documentTasks,
        owners,
        profiles,
      }),
    [
      areas,
      inspectionTypes,
      requirements,
      tasks,
      documents,
      documentTasks,
      owners,
      profiles,
    ],
  );

  const [uploadCell, setUploadCell] = useState<{
    taskId: string;
    areaId: string;
    areaName: string;
    typeName: string;
    allPendingTasks: PendingTaskOption[];
  } | null>(null);

  const [previewCell, setPreviewCell] = useState<{
    taskId: string;
    areaId: string;
    status: TaskStatus;
    documents: DocumentRow[];
    areaName: string;
    typeName: string;
    statusLabel: string;
    canUpload: boolean;
  } | null>(null);

  const isAdmin = userRole === "site_admin" || userRole === "super_admin";
  const isViewer = userRole === "viewer";
  const isInspector = userRole === "inspector";

  const ownedAreaSet = useMemo(
    () => new Set(ownedAreaIds),
    [ownedAreaIds],
  );
  const inspectorWithAssignments =
    isInspector && ownedAreaIds.length > 0;
  const inspectorReadOnly = isInspector && ownedAreaIds.length === 0;

  const myAreas = inspectorWithAssignments
    ? areas.filter((a) => ownedAreaSet.has(a.id))
    : areas;
  const otherAreas = inspectorWithAssignments
    ? areas.filter((a) => !ownedAreaSet.has(a.id))
    : [];

  const canUploadForArea = (areaId: string): boolean => {
    if (isViewer) return false;
    if (inspectorReadOnly) return false;
    if (inspectorWithAssignments) return ownedAreaSet.has(areaId);
    return true;
  };

  const handleCellClick = (areaId: string, typeId: string) => {
    const cell = getCell(matrix, areaId, typeId);
    if (cell.kind !== "task") return;
    const area = areas.find((a) => a.id === areaId);
    const type = inspectionTypes.find((t) => t.id === typeId);
    if (!area || !type) return;

    if (cell.task.status === "pending") {
      // Viewers, unassigned inspectors, and inspectors on a non-owned
      // area can't upload — just no-op on the click.
      if (!canUploadForArea(areaId)) return;

      // Every pending task in the cycle (excluding the clicked task)
      // becomes a candidate for the "Also applies to" picker. The
      // modal partitions into same-area (flat) vs other-areas
      // (collapsible groups).
      const allPending: PendingTaskOption[] = [];
      for (const otherArea of areas) {
        for (const otherType of inspectionTypes) {
          const otherCell = getCell(matrix, otherArea.id, otherType.id);
          if (otherCell.kind !== "task") continue;
          if (otherCell.task.status !== "pending") continue;
          if (otherCell.task.id === cell.task.id) continue;
          allPending.push({
            id: otherCell.task.id,
            typeName: otherType.name,
            areaId: otherArea.id,
            areaName: otherArea.name,
            areaGroup: otherArea.area_group,
          });
        }
      }

      setUploadCell({
        taskId: cell.task.id,
        areaId,
        areaName: area.name,
        typeName: type.name,
        allPendingTasks: allPending,
      });
    } else {
      setPreviewCell({
        taskId: cell.task.id,
        areaId,
        status: cell.task.status,
        documents: cell.documents,
        areaName: area.name,
        typeName: type.name,
        statusLabel: statusLabel(cell.task.status),
        canUpload: canUploadForArea(areaId),
      });
    }
  };

  const handleAddMoreFromPreview = () => {
    if (!previewCell) return;
    // When adding more from the preview, never spread to siblings —
    // this flow is "attach additional docs to this specific task."
    setUploadCell({
      taskId: previewCell.taskId,
      areaId: previewCell.areaId,
      areaName: previewCell.areaName,
      typeName: previewCell.typeName,
      allPendingTasks: [],
    });
    setPreviewCell(null);
  };

  // Submitted tasks: any writer for this area can add more.
  // Approved tasks: only admins can add more (late corrections).
  // Viewers + inspectors on non-owned areas can never add — surfaced
  // via the canUpload flag captured at click time.
  const previewAllowsAdd =
    previewCell &&
    previewCell.canUpload &&
    (previewCell.status === "submitted" ||
      (previewCell.status === "approved" && isAdmin));

  const renderAreaRow = (a: Area, opts: { interactive: boolean }) => (
    <tr
      key={a.id}
      className={cn(
        "hover:bg-muted/30 transition",
        !opts.interactive && "opacity-60",
      )}
    >
      <td
        className={cn(
          "px-4 py-2 border-b font-medium sticky left-0 bg-card hover:bg-muted/30 transition",
          !opts.interactive && "text-muted-foreground",
        )}
      >
        {a.name}
      </td>
      {inspectionTypes.map((t) => {
        const cell = getCell(matrix, a.id, t.id);
        return (
          <td key={t.id} className="px-2 py-1 border-b text-center">
            <CellButton
              cell={cell}
              interactive={opts.interactive}
              onClick={() => handleCellClick(a.id, t.id)}
            />
          </td>
        );
      })}
    </tr>
  );

  return (
    <>
      {inspectorReadOnly && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          No inspections assigned to you this week. The matrix below is
          read-only — contact your site administrator if you should be
          assigned to an area.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left font-medium px-4 py-3 border-b sticky left-0 bg-muted/50 z-10 min-w-[220px]">
                Area
              </th>
              {inspectionTypes.map((t) => (
                <th
                  key={t.id}
                  className="text-center font-medium px-3 py-3 border-b min-w-[110px]"
                  title={t.name}
                >
                  {t.abbreviation}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {myAreas.map((a) =>
              renderAreaRow(a, {
                interactive: !inspectorReadOnly && !isViewer,
              }),
            )}
            {inspectorWithAssignments && otherAreas.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={inspectionTypes.length + 1}
                    className="sticky left-0 bg-muted/40 px-4 py-2 border-b border-t text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Other Areas — read-only
                  </td>
                </tr>
                {otherAreas.map((a) =>
                  renderAreaRow(a, { interactive: false }),
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {uploadCell && (
        <UploadModal
          open={!!uploadCell}
          onOpenChange={(open) => !open && setUploadCell(null)}
          cycleId={cycleId}
          taskId={uploadCell.taskId}
          currentAreaId={uploadCell.areaId}
          areaName={uploadCell.areaName}
          inspectionTypeName={uploadCell.typeName}
          allPendingTasks={uploadCell.allPendingTasks}
        />
      )}

      {previewCell && (
        <DocumentPreviewModal
          open={!!previewCell}
          onOpenChange={(open) => !open && setPreviewCell(null)}
          documents={previewCell.documents}
          areaName={previewCell.areaName}
          inspectionTypeName={previewCell.typeName}
          taskStatusLabel={previewCell.statusLabel}
          onAddMore={previewAllowsAdd ? handleAddMoreFromPreview : undefined}
          canDelete={!isViewer}
        />
      )}
    </>
  );
}

function CellButton({
  cell,
  onClick,
  interactive = true,
}: {
  cell: ReturnType<typeof getCell>;
  onClick: () => void;
  interactive?: boolean;
}) {
  if (cell.kind === "na") {
    return (
      <div className="flex items-center justify-center h-9 text-muted-foreground/40">
        <Minus className="size-4" />
      </div>
    );
  }

  const status = cell.task.status;
  const interactiveStyles = {
    pending:
      "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60",
    submitted:
      "bg-yellow-50 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-950/40 dark:text-yellow-400 dark:hover:bg-yellow-950/60",
    approved:
      "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-400 dark:hover:bg-green-950/60",
  } as const;
  const staticStyles = {
    pending:
      "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    submitted:
      "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
    approved:
      "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  } as const;

  const Icon =
    status === "approved" ? Check : status === "submitted" ? Clock : X;

  const titleText = interactive
    ? `${statusLabel(status)} (click to ${status === "pending" ? "upload" : "view"})`
    : statusLabel(status);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center w-full h-9 rounded transition",
        interactive
          ? `cursor-pointer ${interactiveStyles[status]}`
          : `cursor-default ${staticStyles[status]}`,
      )}
      title={titleText}
    >
      <Icon className="size-4" />
    </button>
  );
}
