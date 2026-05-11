"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { selectSiteAction } from "./actions";
import type { SiteMembership, SiteRole } from "@/lib/types";

const ROLE_LABEL: Record<SiteRole, string> = {
  super_admin: "Super admin",
  site_admin: "Site admin",
  inspector: "Inspector",
};

export function SitePicker({
  memberships,
}: {
  memberships: SiteMembership[];
}) {
  const [selected, setSelected] = useState<string>(memberships[0].site.id);
  const [busy, setBusy] = useState(false);

  const selectedMembership = memberships.find((m) => m.site.id === selected);

  const handleContinue = async () => {
    if (!selected) return;
    setBusy(true);
    const result = await selectSiteAction(selected);
    if (result && "error" in result) {
      toast.error(result.error);
      setBusy(false);
    }
    // On success the server action redirects to /dashboard; busy stays true
    // through the navigation
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="site-select" className="text-sm font-medium">
          Site
        </label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger id="site-select" className="w-full h-auto py-2.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {memberships.map((m) => (
              <SelectItem key={m.site.id} value={m.site.id} className="py-2">
                <div className="flex flex-col items-start gap-0.5 text-left">
                  <span className="font-medium">{m.site.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.site.location ? `${m.site.location} · ` : ""}
                    {ROLE_LABEL[m.role]}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedMembership && (
          <p className="text-xs text-muted-foreground pt-1">
            Signed in as <strong>{ROLE_LABEL[selectedMembership.role]}</strong>
            {selectedMembership.site.location && (
              <> at {selectedMembership.site.location}</>
            )}
          </p>
        )}
      </div>
      <Button
        onClick={handleContinue}
        disabled={busy || !selected}
        className="w-full"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Continue
      </Button>
    </div>
  );
}
