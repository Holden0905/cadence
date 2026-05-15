"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Upload, X, FileText, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type PendingTaskOption = {
  /** task id */
  id: string;
  /** inspection type display name (e.g. "VEO") */
  typeName: string;
  areaId: string;
  areaName: string;
  /** From areas.area_group. null means ungrouped. */
  areaGroup: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  taskId: string;
  /** Area the user clicked into. Used to partition same-area vs
   *  other-area tasks in the "Also applies to" picker. */
  currentAreaId: string;
  areaName: string;
  inspectionTypeName: string;
  /** Every pending task in the current cycle except the one being
   *  uploaded. Partitioned into same-area (flat checkboxes) and
   *  other-areas (collapsible). */
  allPendingTasks?: PendingTaskOption[];
};

type StagedFile = {
  file: File;
  previewUrl: string | null;
};

export function UploadModal({
  open,
  onOpenChange,
  cycleId,
  taskId,
  currentAreaId,
  areaName,
  inspectionTypeName,
  allPendingTasks = [],
}: Props) {
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [extraTaskIds, setExtraTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        files.forEach(
          (f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl),
        );
        setFiles([]);
        setExtraTaskIds(new Set());
      }
      onOpenChange(nextOpen);
    },
    [files, onOpenChange],
  );

  const toggleExtra = (id: string) => {
    setExtraTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Split allPendingTasks into "same area" (flat checkboxes above)
  // and "other areas" (grouped, collapsible below). Insertion order
  // from the parent is preserved within each bucket.
  const partitioned = useMemo(() => {
    type AreaBucket = {
      areaId: string;
      areaName: string;
      areaGroup: string | null;
      tasks: PendingTaskOption[];
    };
    type Group = {
      label: string;
      areas: AreaBucket[];
    };

    const sameArea: PendingTaskOption[] = [];
    const otherByArea = new Map<string, AreaBucket>();

    for (const t of allPendingTasks) {
      if (t.areaId === currentAreaId) {
        sameArea.push(t);
        continue;
      }
      const bucket =
        otherByArea.get(t.areaId) ??
        ({
          areaId: t.areaId,
          areaName: t.areaName,
          areaGroup: t.areaGroup,
          tasks: [],
        } as AreaBucket);
      bucket.tasks.push(t);
      otherByArea.set(t.areaId, bucket);
    }

    const namedGroupsMap = new Map<string, AreaBucket[]>();
    const ungrouped: AreaBucket[] = [];
    for (const bucket of otherByArea.values()) {
      if (bucket.areaGroup === null) {
        ungrouped.push(bucket);
      } else {
        const arr = namedGroupsMap.get(bucket.areaGroup) ?? [];
        arr.push(bucket);
        namedGroupsMap.set(bucket.areaGroup, arr);
      }
    }

    const groups: Group[] = [];
    for (const [label, areas] of namedGroupsMap) {
      groups.push({ label, areas });
    }
    if (ungrouped.length === 1) {
      // Single ungrouped area is promoted to a top-level entry — no
      // "Other" wrapper. Its label is the area name.
      groups.push({ label: ungrouped[0].areaName, areas: ungrouped });
    } else if (ungrouped.length > 1) {
      groups.push({ label: "Other", areas: ungrouped });
    }

    let totalOther = 0;
    for (const bucket of otherByArea.values()) totalOther += bucket.tasks.length;

    return { sameArea, groups, totalOther };
  }, [allPendingTasks, currentAreaId]);

  const addFiles = (incoming: File[]) => {
    const staged = incoming.map<StagedFile>((file) => ({
      file,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
    }));
    setFiles((prev) => [...prev, ...staged]);
  };

  useEffect(() => {
    if (!open) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) {
            const ext = f.type.split("/")[1] || "png";
            const renamed = new File(
              [f],
              `pasted-${Date.now()}.${ext}`,
              { type: f.type },
            );
            pasted.push(renamed);
          }
        }
      }
      if (pasted.length) {
        e.preventDefault();
        addFiles(pasted);
        toast.success(
          `${pasted.length} image${pasted.length > 1 ? "s" : ""} pasted`,
        );
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) addFiles(dropped);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setUploading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be signed in to upload");
      setUploading(false);
      return;
    }

    // Original task is always included. Extras are the sibling pending
    // tasks the user checked.
    const allTaskIds = [taskId, ...Array.from(extraTaskIds)];

    try {
      for (const staged of files) {
        const safeName = staged.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${cycleId}/${taskId}/${Date.now()}_${safeName}`;
        const { error: uploadErr } = await supabase.storage
          .from("inspection-documents")
          .upload(path, staged.file, {
            cacheControl: "3600",
            upsert: false,
            contentType: staged.file.type,
          });
        if (uploadErr) throw uploadErr;

        // task_id intentionally omitted — the column is deprecated and
        // the junction below is the source of truth.
        const { data: docRow, error: insertErr } = await supabase
          .from("documents")
          .insert({
            file_path: path,
            file_name: staged.file.name,
            file_type: staged.file.type,
            file_size: staged.file.size,
            uploaded_by: user.id,
          })
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        if (!docRow) throw new Error("Document insert returned no row");

        const { error: junctionErr } = await supabase
          .from("document_tasks")
          .insert(
            allTaskIds.map((tid) => ({
              document_id: docRow.id,
              task_id: tid,
            })),
          );
        if (junctionErr) throw junctionErr;
      }

      // Transition each linked task pending → submitted. Tasks that are
      // already submitted or approved are skipped by the .eq filter so
      // submitted_by/at and approved_by/at aren't overwritten.
      const { error: taskErr } = await supabase
        .from("inspection_tasks")
        .update({
          status: "submitted",
          submitted_by: user.id,
          submitted_at: new Date().toISOString(),
        })
        .in("id", allTaskIds)
        .eq("status", "pending");
      if (taskErr) throw taskErr;

      const taskCount = allTaskIds.length;
      const fileCount = files.length;
      toast.success(
        taskCount > 1
          ? `${fileCount} document${fileCount > 1 ? "s" : ""} submitted across ${taskCount} inspections`
          : `${fileCount} document${fileCount > 1 ? "s" : ""} submitted`,
      );
      handleOpenChange(false);
      router.refresh();
    } catch (err) {
      // Supabase returns PostgrestError objects that aren't Error
      // instances, so plain `err.message` was being skipped before.
      // Log the full shape and surface whatever message/code we can.
      console.error("[upload-modal] submit failed:", err);
      let msg = "Upload failed";
      if (err && typeof err === "object") {
        const e = err as {
          message?: string;
          code?: string;
          details?: string;
          hint?: string;
        };
        const parts = [
          e.message,
          e.code ? `(code ${e.code})` : null,
          e.details,
          e.hint,
        ].filter(Boolean);
        if (parts.length) msg = parts.join(" — ");
      } else if (typeof err === "string") {
        msg = err;
      }
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload inspection document</DialogTitle>
          <DialogDescription>
            <strong>{areaName}</strong> — {inspectionTypeName}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={dropRef}
          className={cn(
            "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-muted-foreground/50",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <Upload className="size-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">
            Drag & drop, paste (Ctrl+V), or pick files
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Images (PNG/JPG/WebP), PDF, DOCX • Up to 10 MB each
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length) addFiles(list);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </div>

        {(partitioned.sameArea.length > 0 ||
          partitioned.totalOther > 0) && (
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium mb-1">
              Also applies to{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (this upload will mark each checked inspection submitted)
              </span>
            </p>
            {partitioned.sameArea.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-2">
                {partitioned.sameArea.map((sib) => {
                  const checkboxId = `extra-task-${sib.id}`;
                  return (
                    <div key={sib.id} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={extraTaskIds.has(sib.id)}
                        onCheckedChange={() => toggleExtra(sib.id)}
                        disabled={uploading}
                      />
                      <Label
                        htmlFor={checkboxId}
                        className="cursor-pointer font-normal"
                      >
                        {sib.typeName}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}

            {partitioned.totalOther > 0 && (
              <details
                className={cn(
                  "group mt-3 rounded border bg-background/40",
                  partitioned.sameArea.length === 0 && "mt-1",
                )}
              >
                <summary className="flex items-center gap-1.5 cursor-pointer list-none px-2.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition select-none">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                  Other areas ({partitioned.totalOther} pending task
                  {partitioned.totalOther === 1 ? "" : "s"})
                </summary>
                <div className="flex flex-col gap-1 px-2 pb-2">
                  {partitioned.groups.map((group) => {
                    const groupTotal = group.areas.reduce(
                      (sum, a) => sum + a.tasks.length,
                      0,
                    );
                    const singleArea = group.areas.length === 1;
                    return (
                      <details
                        key={group.label}
                        className="group/group rounded bg-background"
                      >
                        <summary className="flex items-center gap-1.5 cursor-pointer list-none px-2 py-1.5 text-sm font-medium hover:bg-muted/40 rounded transition select-none">
                          <ChevronRight className="size-3.5 transition-transform group-open/group:rotate-90" />
                          {group.label} ({groupTotal} pending task
                          {groupTotal === 1 ? "" : "s"})
                        </summary>
                        <div className="pl-5 pr-2 pb-1.5 flex flex-col gap-1">
                          {group.areas.map((area) => (
                            <div key={area.areaId}>
                              {!singleArea && (
                                <p className="text-xs font-medium text-muted-foreground mt-1.5 mb-0.5">
                                  {area.areaName}
                                </p>
                              )}
                              <div className="flex flex-col gap-1 pl-1">
                                {area.tasks.map((t) => {
                                  const checkboxId = `extra-task-${t.id}`;
                                  return (
                                    <div
                                      key={t.id}
                                      className="flex items-center gap-2"
                                    >
                                      <Checkbox
                                        id={checkboxId}
                                        checked={extraTaskIds.has(t.id)}
                                        onCheckedChange={() =>
                                          toggleExtra(t.id)
                                        }
                                        disabled={uploading}
                                      />
                                      <Label
                                        htmlFor={checkboxId}
                                        className="cursor-pointer font-normal"
                                      >
                                        {t.typeName}
                                      </Label>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        )}

        {files.length > 0 && (
          <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
            {files.map((f, idx) => (
              <div
                key={idx}
                className="relative group rounded border bg-muted/30 overflow-hidden aspect-square"
              >
                {f.previewUrl ? (
                  <Image
                    src={f.previewUrl}
                    alt={f.file.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-2 text-center">
                    <FileText className="size-8 text-muted-foreground mb-1" />
                    <p className="text-[10px] truncate w-full">
                      {f.file.name}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="absolute top-1 right-1 rounded-full bg-background/90 p-1 opacity-0 group-hover:opacity-100 transition"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={uploading || files.length === 0}
          >
            {uploading
              ? "Uploading..."
              : `Submit ${files.length || ""} document${
                  files.length === 1 ? "" : "s"
                }`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
