"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { deleteDocumentAction } from "@/app/(platform)/dashboard/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { DocumentRow } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: DocumentRow[];
  areaName: string;
  inspectionTypeName: string;
  taskStatusLabel: string;
  /** Provided by parent when the user is allowed to attach more files. */
  onAddMore?: () => void;
};

export function DocumentPreviewModal({
  open,
  onOpenChange,
  documents,
  areaName,
  inspectionTypeName,
  taskStatusLabel,
  onAddMore,
}: Props) {
  const router = useRouter();
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<DocumentRow[]>(documents);
  const [confirmDoc, setConfirmDoc] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) setDocs(documents);
  }, [open, documents]);

  const paths = useMemo(() => docs.map((d) => d.file_path), [docs]);

  useEffect(() => {
    if (!open || paths.length === 0) {
      setSignedUrls({});
      return;
    }
    setLoading(true);
    const supabase = createClient();
    supabase.storage
      .from("inspection-documents")
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        data?.forEach((entry, idx) => {
          if (entry.signedUrl) map[paths[idx]] = entry.signedUrl;
        });
        setSignedUrls(map);
        setLoading(false);
      });
  }, [open, paths]);

  const handleConfirmDelete = async () => {
    if (!confirmDoc) return;
    setDeleting(true);
    const result = await deleteDocumentAction(confirmDoc.id);
    setDeleting(false);

    if ("error" in result) {
      toast.error(result.error);
      setConfirmDoc(null);
      return;
    }

    toast.success("Document deleted");
    const remaining = docs.filter((d) => d.id !== confirmDoc.id);
    setDocs(remaining);
    setConfirmDoc(null);
    router.refresh();

    if (remaining.length === 0) {
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {areaName} — {inspectionTypeName}
            </DialogTitle>
            <DialogDescription>
              Status: {taskStatusLabel} • {docs.length} document
              {docs.length === 1 ? "" : "s"}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {docs.map((doc) => {
                const url = signedUrls[doc.file_path];
                const isImage = (doc.file_type ?? "").startsWith("image/");
                return (
                  <div
                    key={doc.id}
                    className="rounded border bg-muted/30 overflow-hidden"
                  >
                    {isImage && url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={doc.file_name}
                        className="w-full max-h-[50vh] object-contain bg-black/5"
                      />
                    ) : (
                      <div className="flex items-center gap-3 p-4">
                        <FileText className="size-8 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {doc.file_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.file_type ?? "unknown"}
                            {doc.file_size
                              ? ` • ${(doc.file_size / 1024).toFixed(0)} KB`
                              : ""}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 border-t px-3 py-2 bg-background/50">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {doc.file_name}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        {url && (
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Download className="size-3.5" />
                              Open
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmDoc(doc)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {onAddMore && (
            <DialogFooter className="sm:justify-start">
              <Button variant="outline" onClick={onAddMore}>
                <Upload className="size-4" />
                Add more documents
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmDoc}
        onOpenChange={(open) => !open && !deleting && setConfirmDoc(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this document?</DialogTitle>
            <DialogDescription>
              <span className="font-medium">{confirmDoc?.file_name}</span> will
              be permanently removed.
              {docs.length === 1 && (
                <>
                  {" "}
                  This is the last document attached — the task will revert to{" "}
                  <strong>pending</strong>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDoc(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
