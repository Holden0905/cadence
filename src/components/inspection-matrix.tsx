"use client";

import { useMemo, useState } from "react";
import { Check, Clock, X, Minus } from "lucide-react";
import { UploadModal } from "@/components/upload-modal";
import { DocumentPreviewModal } from "@/components/document-preview-modal";
import { cn } from "@/lib/utils";
import { buildMatrix, getCell, statusLabel } from "@/lib/matrix";
import type {
  Area,
  AreaRequirement,
  AreaRequirementOwner,
  DocumentRow,
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
  owners: AreaRequirementOwner[];
  profiles: Profile[];
  userRole: SiteRole;
};

export function InspectionMatrix({
  cycleId,
  areas,
  inspectionTypes,
  requirements,
  tasks,
  documents,
  owners,
  profiles,
  userRole,
}: Props) {
  const matrix = useMemo(
    () =>
      buildMatrix({
        areas,
        inspectionTypes,
        requirements,
        tasks,
        documents,
        owners,
        profiles,
      }),
    [areas, inspectionTypes, requirements, tasks, documents, owners, profiles],
  );

  const [uploadCell, setUploadCell] = useState<{
    taskId: string;
    areaName: string;
    typeName: string;
  } | null>(null);

  const [previewCell, setPreviewCell] = useState<{
    taskId: string;
    status: TaskStatus;
    documents: DocumentRow[];
    areaName: string;
    typeName: string;
    statusLabel: string;
  } | null>(null);

  const isAdmin = userRole === "site_admin" || userRole === "super_admin";
  const isViewer = userRole === "viewer";

  const handleCellClick = (areaId: string, typeId: string) => {
    const cell = getCell(matrix, areaId, typeId);
    if (cell.kind !== "task") return;
    const area = areas.find((a) => a.id === areaId);
    const type = inspectionTypes.find((t) => t.id === typeId);
    if (!area || !type) return;

    if (cell.task.status === "pending") {
      // Viewers can see the matrix but never upload.
      if (isViewer) return;
      setUploadCell({
        taskId: cell.task.id,
        areaName: area.name,
        typeName: type.name,
      });
    } else {
      setPreviewCell({
        taskId: cell.task.id,
        status: cell.task.status,
        documents: cell.documents,
        areaName: area.name,
        typeName: type.name,
        statusLabel: statusLabel(cell.task.status),
      });
    }
  };

  const handleAddMoreFromPreview = () => {
    if (!previewCell) return;
    setUploadCell({
      taskId: previewCell.taskId,
      areaName: previewCell.areaName,
      typeName: previewCell.typeName,
    });
    setPreviewCell(null);
  };

  // Submitted tasks: any writer can add more.
  // Approved tasks: only admins can add more (late corrections).
  // Viewers can never add.
  const previewAllowsAdd =
    !isViewer &&
    previewCell &&
    (previewCell.status === "submitted" ||
      (previewCell.status === "approved" && isAdmin));

  return (
    <>
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
            {areas.map((a) => (
              <tr key={a.id} className="hover:bg-muted/30 transition">
                <td className="px-4 py-2 border-b font-medium sticky left-0 bg-card hover:bg-muted/30 transition">
                  {a.name}
                </td>
                {inspectionTypes.map((t) => {
                  const cell = getCell(matrix, a.id, t.id);
                  return (
                    <td
                      key={t.id}
                      className="px-2 py-1 border-b text-center"
                    >
                      <CellButton
                        cell={cell}
                        onClick={() => handleCellClick(a.id, t.id)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {uploadCell && (
        <UploadModal
          open={!!uploadCell}
          onOpenChange={(open) => !open && setUploadCell(null)}
          cycleId={cycleId}
          taskId={uploadCell.taskId}
          areaName={uploadCell.areaName}
          inspectionTypeName={uploadCell.typeName}
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
}: {
  cell: ReturnType<typeof getCell>;
  onClick: () => void;
}) {
  if (cell.kind === "na") {
    return (
      <div className="flex items-center justify-center h-9 text-muted-foreground/40">
        <Minus className="size-4" />
      </div>
    );
  }

  const status = cell.task.status;
  const styles = {
    pending:
      "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60",
    submitted:
      "bg-yellow-50 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-950/40 dark:text-yellow-400 dark:hover:bg-yellow-950/60",
    approved:
      "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-400 dark:hover:bg-green-950/60",
  } as const;

  const Icon =
    status === "approved" ? Check : status === "submitted" ? Clock : X;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center w-full h-9 rounded transition cursor-pointer",
        styles[status],
      )}
      title={`${statusLabel(status)} (click to ${
        status === "pending" ? "upload" : "view"
      })`}
    >
      <Icon className="size-4" />
    </button>
  );
}
