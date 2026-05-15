"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
import { Upload, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  taskId: string;
  areaName: string;
  inspectionTypeName: string;
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
  areaName,
  inspectionTypeName,
}: Props) {
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
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
      }
      onOpenChange(nextOpen);
    },
    [files, onOpenChange],
  );

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

        const { error: insertErr } = await supabase.from("documents").insert({
          task_id: taskId,
          file_path: path,
          file_name: staged.file.name,
          file_type: staged.file.type,
          file_size: staged.file.size,
          uploaded_by: user.id,
        });
        if (insertErr) throw insertErr;
      }

      // Only transition pending → submitted. If the task is already
      // submitted or approved, don't overwrite submitted_by/at or
      // approved_by/at — we're just adding more documents.
      const { error: taskErr } = await supabase
        .from("inspection_tasks")
        .update({
          status: "submitted",
          submitted_by: user.id,
          submitted_at: new Date().toISOString(),
        })
        .eq("id", taskId)
        .eq("status", "pending");
      if (taskErr) throw taskErr;

      toast.success(
        `${files.length} document${files.length > 1 ? "s" : ""} submitted`,
      );
      handleOpenChange(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
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
