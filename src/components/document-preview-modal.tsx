"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2 } from "lucide-react";
import type { DocumentRow } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: DocumentRow[];
  areaName: string;
  inspectionTypeName: string;
  taskStatusLabel: string;
};

export function DocumentPreviewModal({
  open,
  onOpenChange,
  documents,
  areaName,
  inspectionTypeName,
  taskStatusLabel,
}: Props) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || documents.length === 0) return;
    setLoading(true);
    const supabase = createClient();
    const paths = documents.map((d) => d.file_path);
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
  }, [open, documents]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {areaName} — {inspectionTypeName}
          </DialogTitle>
          <DialogDescription>
            Status: {taskStatusLabel} • {documents.length} document
            {documents.length === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {documents.map((doc) => {
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
                  <div className="flex items-center justify-between border-t px-3 py-2 bg-background/50">
                    <p className="text-xs text-muted-foreground truncate flex-1">
                      {doc.file_name}
                    </p>
                    {url && (
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        className="ml-2"
                      >
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
