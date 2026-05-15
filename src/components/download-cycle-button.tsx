"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

type Props = {
  cycleId: string;
  approvedDocCount: number;
};

export function DownloadCycleButton({ cycleId, approvedDocCount }: Props) {
  const [busy, setBusy] = useState(false);

  if (approvedDocCount === 0) {
    return (
      <Button variant="outline" size="sm" disabled title="No approved documents yet">
        <Download className="size-4" />
        Download documents
      </Button>
    );
  }

  const handleClick = () => {
    setBusy(true);
    // Brief disable to prevent double-clicks while the browser starts
    // the download. The actual transfer is handled by the browser.
    const href = `/api/download-cycle?cycleId=${encodeURIComponent(cycleId)}`;
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => setBusy(false), 2000);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={busy}>
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      Download documents ({approvedDocCount})
    </Button>
  );
}
