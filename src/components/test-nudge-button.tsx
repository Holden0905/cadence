"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendTestNudgeAction } from "@/app/(platform)/dashboard/actions";

export function TestNudgeButton() {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    const result = await sendTestNudgeAction();
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (result.status === "skipped") {
      toast.warning(
        result.reason
          ? `Skipped: ${result.reason}`
          : "Nudges skipped (no email key configured)",
      );
      return;
    }
    toast.success(
      `Test nudges sent to ${result.sentTo} primary owner${result.sentTo === 1 ? "" : "s"}`,
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
        <Bell className="size-4" />
      )}
      Send test nudge
    </Button>
  );
}
