"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Check, X, Loader2, History as HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, formatWeekRange } from "@/lib/dates";
import { rejectTaskAction } from "@/app/(platform)/review/actions";
import type {
  Area,
  DocumentRow,
  InspectionCycle,
  InspectionTask,
  InspectionType,
  Profile,
} from "@/lib/types";

type SubmittedItem = {
  task: InspectionTask;
  area: Area;
  inspectionType: InspectionType;
  submitter: Profile | null;
  documents: DocumentRow[];
  cycle: InspectionCycle;
  isPastWeek: boolean;
};

type Props = {
  items: SubmittedItem[];
};

export function ReviewList({ items }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<SubmittedItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [lightbox, setLightbox] = useState<{
    item: SubmittedItem;
    docIndex: number;
  } | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    const supabase = createClient();
    const allPaths = items.flatMap((it) => it.documents.map((d) => d.file_path));
    if (allPaths.length === 0) return;
    supabase.storage
      .from("inspection-documents")
      .createSignedUrls(allPaths, 3600)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        data?.forEach((entry, idx) => {
          if (entry.signedUrl) map[allPaths[idx]] = entry.signedUrl;
        });
        setThumbUrls(map);
      });
  }, [items]);

  const allSelected = useMemo(
    () => items.length > 0 && selected.size === items.length,
    [items, selected],
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((it) => it.task.id)));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const approveOne = async (taskId: string) => {
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sign in required");
      setBusy(false);
      return;
    }
    const { error } = await supabase
      .from("inspection_tasks")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Inspection approved");
      router.refresh();
    }
  };

  const openReject = (item: SubmittedItem) => {
    setRejectReason("");
    setRejecting(item);
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    setBusy(true);
    const result = await rejectTaskAction({
      taskId: rejecting.task.id,
      reason: rejectReason,
    });
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (result.emailFailed > 0) {
      toast.warning(
        `Inspection rejected, but the owner notification failed${result.emailReason ? ` — ${result.emailReason}` : ""}`,
      );
    } else if (result.emailed === 0) {
      toast.success(
        `Inspection rejected${result.emailReason ? ` — ${result.emailReason}` : " (no owner to notify)"}`,
      );
    } else {
      toast.success(
        `Inspection rejected and owner notified (${result.emailed})`,
      );
    }
    setRejecting(null);
    setRejectReason("");
    router.refresh();
  };

  const approveSelected = async () => {
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sign in required");
      setBusy(false);
      return;
    }
    const { error } = await supabase
      .from("inspection_tasks")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .in("id", Array.from(selected));
    setBusy(false);
    setConfirming(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${selected.size} inspections approved`);
      setSelected(new Set());
      router.refresh();
    }
  };

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        No submitted inspections awaiting review.
      </Card>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            id="select-all"
          />
          <label
            htmlFor="select-all"
            className="text-sm font-medium cursor-pointer"
          >
            Select all ({items.length})
          </label>
        </div>
        <Button
          onClick={() => setConfirming(true)}
          disabled={selected.size === 0 || busy}
        >
          <Check className="size-4" />
          Bulk approve ({selected.size})
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((it) => (
          <Card
            key={it.task.id}
            className="p-4 flex items-start gap-4 flex-wrap sm:flex-nowrap"
          >
            <Checkbox
              checked={selected.has(it.task.id)}
              onCheckedChange={() => toggle(it.task.id)}
              className="mt-1"
            />

            <div className="flex-1 min-w-0">
              <p className="font-medium">
                {it.area.name}
                <span className="text-muted-foreground"> — </span>
                {it.inspectionType.name}{" "}
                <span className="text-muted-foreground text-xs">
                  ({it.inspectionType.abbreviation})
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                <span>
                  Week of{" "}
                  {formatWeekRange(it.cycle.week_start, it.cycle.week_end)}
                </span>
                {it.isPastWeek && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                    <HistoryIcon className="size-2.5" />
                    Past
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Submitted by{" "}
                <strong>
                  {it.submitter?.full_name || it.submitter?.email || "—"}
                </strong>{" "}
                · {formatDateTime(it.task.submitted_at)}
              </p>

              {it.documents.length > 0 && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  {it.documents.map((doc, idx) => {
                    const url = thumbUrls[doc.file_path];
                    const isImage = (doc.file_type ?? "").startsWith(
                      "image/",
                    );
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() =>
                          setLightbox({ item: it, docIndex: idx })
                        }
                        className="rounded border bg-muted/30 overflow-hidden hover:ring-2 hover:ring-ring transition cursor-pointer"
                        title={doc.file_name}
                      >
                        {isImage && url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={doc.file_name}
                            className="w-16 h-16 object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 flex flex-col items-center justify-center p-1">
                            <FileText className="size-5 text-muted-foreground" />
                            <p className="text-[8px] truncate w-full text-center mt-0.5">
                              {doc.file_name.split(".").pop()?.toUpperCase()}
                            </p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <Button
                size="sm"
                onClick={() => approveOne(it.task.id)}
                disabled={busy}
              >
                <Check className="size-4" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openReject(it)}
                disabled={busy}
              >
                <X className="size-4" />
                Reject
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog
        open={!!rejecting}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRejecting(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject inspection</DialogTitle>
            <DialogDescription>
              {rejecting ? (
                <>
                  Revert <strong>{rejecting.area.name}</strong> —{" "}
                  {rejecting.inspectionType.name} to pending and notify the
                  primary owner. The uploaded documents stay attached.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="reject_reason"
              className="text-sm font-medium block mb-1.5"
            >
              Reason{" "}
              <span className="font-normal text-muted-foreground">
                (optional, included in the email)
              </span>
            </label>
            <textarea
              id="reject_reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="e.g. Photo doesn't include the timestamp / wrong area / unclear image"
              className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejecting(null);
                setRejectReason("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={confirmReject} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk approve</DialogTitle>
            <DialogDescription>
              Approve {selected.size} inspection
              {selected.size === 1 ? "" : "s"}? This will mark them as
              approved and stamp your name and the current time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={approveSelected} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Approve {selected.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lightbox && (
        <Dialog
          open
          onOpenChange={(open) => !open && setLightbox(null)}
        >
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {lightbox.item.area.name} —{" "}
                {lightbox.item.inspectionType.name}
              </DialogTitle>
              <DialogDescription>
                {lightbox.item.documents[lightbox.docIndex]?.file_name}
              </DialogDescription>
            </DialogHeader>
            <LightboxContent
              doc={lightbox.item.documents[lightbox.docIndex]}
              url={
                thumbUrls[
                  lightbox.item.documents[lightbox.docIndex]?.file_path ?? ""
                ]
              }
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function LightboxContent({
  doc,
  url,
}: {
  doc: DocumentRow | undefined;
  url: string | undefined;
}) {
  if (!doc) return null;
  const isImage = (doc.file_type ?? "").startsWith("image/");
  if (isImage && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={doc.file_name}
        className="w-full max-h-[70vh] object-contain rounded bg-black/5"
      />
    );
  }
  return (
    <div className="flex flex-col items-center p-8 gap-3">
      <FileText className="size-12 text-muted-foreground" />
      <p className="text-sm font-medium">{doc.file_name}</p>
      {url && (
        <Button asChild variant="outline" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open file
          </a>
        </Button>
      )}
    </div>
  );
}
