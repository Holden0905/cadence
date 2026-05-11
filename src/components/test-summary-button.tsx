"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendTestSummaryAction } from "@/app/(platform)/dashboard/actions";

export function TestSummaryButton() {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    const result = await sendTestSummaryAction();
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (result.status === "skipped") {
      toast.warning(
        result.reason
          ? `Skipped: ${result.reason}`
          : "Summary skipped (no email key configured)",
      );
      return;
    }
    toast.success(
      `Test summary sent to ${result.recipients} recipient${result.recipients === 1 ? "" : "s"}`,
    );
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={busy}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Mail className="size-4" />
      )}
      Send test summary
    </Button>
  );
}
