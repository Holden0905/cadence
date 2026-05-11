"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendCompletionReportAction } from "@/app/(platform)/history/[id]/actions";

export function CompletionReportButton({ cycleId }: { cycleId: string }) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (
      !confirm(
        "Send the completion report to all active recipients for this site?",
      )
    )
      return;
    setBusy(true);
    const result = await sendCompletionReportAction(cycleId);
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (result.status === "skipped") {
      toast.warning(
        result.reason
          ? `Skipped: ${result.reason}`
          : "Completion report not sent (no email key configured)",
      );
      return;
    }
    if (result.status === "partial") {
      toast.warning(
        `Sent to ${result.succeeded ?? "?"} of ${result.recipients} recipients. ${result.failed} failed — check server logs.`,
      );
      return;
    }
    toast.success(
      `Completion report sent to ${result.recipients} recipient${result.recipients === 1 ? "" : "s"}`,
    );
  };

  return (
    <Button onClick={handleClick} disabled={busy}>
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Send className="size-4" />
      )}
      Send completion report
    </Button>
  );
}
