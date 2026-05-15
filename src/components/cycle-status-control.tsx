"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateCycleStatusAction } from "@/app/(platform)/history/[id]/actions";
import type { CycleStatus } from "@/lib/types";

type Props = {
  cycleId: string;
  currentStatus: CycleStatus;
};

const STATUS_LABELS: Record<CycleStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export function CycleStatusControl({ cycleId, currentStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleChange = async (next: string) => {
    if (next === currentStatus) return;
    const status = next as CycleStatus;
    setBusy(true);
    const result = await updateCycleStatusAction({ cycleId, status });
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`Cycle status changed to ${STATUS_LABELS[status]}`);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentStatus}
        onValueChange={handleChange}
        disabled={busy}
      >
        <SelectTrigger size="sm" className="capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>
      {busy && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
