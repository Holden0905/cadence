"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { selectSiteAction } from "./actions";
import type { SiteMembership, SiteRole } from "@/lib/types";

const ROLE_LABEL: Record<SiteRole, string> = {
  super_admin: "Super admin",
  site_admin: "Site admin",
  inspector: "Inspector",
  viewer: "Viewer",
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
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="site-select" className="text-sm font-medium">
          Site
        </label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger
            id="site-select"
            className="w-full"
            aria-label="Select a site"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">
                {selectedMembership?.site.name ?? "Choose a site"}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="max-w-[min(28rem,calc(100vw-2rem))]">
            {memberships.map((m) => (
              <SelectItem
                key={m.site.id}
                value={m.site.id}
                className="py-2"
              >
                <div className="flex flex-col items-start gap-0.5 text-left min-w-0">
                  <span className="font-medium truncate max-w-[24rem]">
                    {m.site.name}
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-[24rem]">
                    {m.site.location ? `${m.site.location} · ` : ""}
                    {ROLE_LABEL[m.role]}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedMembership && (
          <p className="text-xs text-muted-foreground pt-1 truncate">
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
