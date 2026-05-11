"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { selectSiteAction } from "./actions";
import type { SiteMembership } from "@/lib/types";

const ROLE_LABEL: Record<SiteMembership["role"], string> = {
  super_admin: "Super admin",
  site_admin: "Site admin",
  inspector: "Inspector",
};

export function SiteCardList({
  memberships,
}: {
  memberships: SiteMembership[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const handleSelect = async (siteId: string) => {
    setBusy(siteId);
    const result = await selectSiteAction(siteId);
    if (result && "error" in result) {
      toast.error(result.error);
      setBusy(null);
      return;
    }
    router.refresh();
  };

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {memberships.map((m) => (
        <Card
          key={m.site.id}
          onClick={() => !busy && handleSelect(m.site.id)}
          className="p-5 cursor-pointer transition hover:bg-muted/40 hover:border-foreground/20"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-muted p-2.5">
              <Building2 className="size-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-tight">{m.site.name}</p>
              {m.site.location && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {m.site.location}
                </p>
              )}
              <p className="mt-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                {ROLE_LABEL[m.role]}
              </p>
            </div>
            {busy === m.site.id && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
