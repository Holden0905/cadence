"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, Users } from "lucide-react";
import { toast } from "sonner";
import type {
  Area,
  AreaRequirement,
  AreaRequirementOwner,
  InspectionType,
  Profile,
} from "@/lib/types";

type Props = {
  areas: Area[];
  inspectionTypes: InspectionType[];
  requirements: AreaRequirement[];
  owners: AreaRequirementOwner[];
  profiles: Profile[];
};

export function RequirementsAdmin({
  areas,
  inspectionTypes,
  requirements,
  owners,
  profiles,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [editingReq, setEditingReq] = useState<{
    requirement: AreaRequirement;
    area: Area;
    type: InspectionType;
  } | null>(null);

  const reqByAreaType = useMemo(() => {
    const map = new Map<string, AreaRequirement>();
    for (const r of requirements) {
      map.set(`${r.area_id}::${r.inspection_type_id}`, r);
    }
    return map;
  }, [requirements]);

  const ownersByReq = useMemo(() => {
    const map = new Map<string, AreaRequirementOwner[]>();
    for (const o of owners) {
      const arr = map.get(o.area_requirement_id) ?? [];
      arr.push(o);
      map.set(o.area_requirement_id, arr);
    }
    return map;
  }, [owners]);

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const toggleRequirement = async (areaId: string, typeId: string) => {
    const existing = reqByAreaType.get(`${areaId}::${typeId}`);
    if (!existing) {
      // No row yet — INSERT active. Trigger creates a task on the
      // current active cycle.
      const { error } = await supabase.from("area_requirements").insert({
        area_id: areaId,
        inspection_type_id: typeId,
        is_active: true,
      });
      if (error) toast.error(error.message);
    } else {
      // Flip is_active. Owners survive because we never DELETE the
      // requirement row. Trigger creates a task on the active cycle
      // when is_active goes false→true.
      const { error } = await supabase
        .from("area_requirements")
        .update({ is_active: !existing.is_active })
        .eq("id", existing.id);
      if (error) toast.error(error.message);
    }
    router.refresh();
  };

  return (
    <>
      <div className="mb-4 text-sm text-muted-foreground">
        Click a cell to toggle whether that inspection type applies to that
        area. Click the people icon to assign owners.
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 sticky left-0 bg-muted/50 min-w-[220px]">
                Area
              </th>
              {inspectionTypes.map((t) => (
                <th
                  key={t.id}
                  className="text-center px-3 py-3 min-w-[100px]"
                  title={t.name}
                >
                  {t.abbreviation}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2 font-medium sticky left-0 bg-card">
                  {a.name}
                </td>
                {inspectionTypes.map((t) => {
                  const req = reqByAreaType.get(`${a.id}::${t.id}`);
                  const reqOwners = req ? ownersByReq.get(req.id) ?? [] : [];
                  const isActive = !!(req && req.is_active);
                  return (
                    <td key={t.id} className="px-2 py-1 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleRequirement(a.id, t.id)}
                          className={`size-7 rounded text-xs font-semibold transition cursor-pointer ${
                            isActive
                              ? "bg-primary text-primary-foreground hover:opacity-90"
                              : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                          title={
                            isActive
                              ? "Active — click to deactivate (owners preserved)"
                              : req
                                ? "Inactive — click to reactivate"
                                : "Click to add requirement"
                          }
                        >
                          {isActive ? "✓" : ""}
                        </button>
                        {req && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditingReq({
                                requirement: req,
                                area: a,
                                type: t,
                              })
                            }
                            className="rounded p-1 hover:bg-muted relative"
                            title={`${reqOwners.length} owner${reqOwners.length === 1 ? "" : "s"}`}
                          >
                            <Users className="size-3.5" />
                            {reqOwners.length > 0 && (
                              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full size-3.5 text-[9px] flex items-center justify-center">
                                {reqOwners.length}
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editingReq && (
        <OwnersDialog
          requirement={editingReq.requirement}
          area={editingReq.area}
          type={editingReq.type}
          owners={ownersByReq.get(editingReq.requirement.id) ?? []}
          profiles={profiles.filter((p) => p.is_active)}
          profileById={profileById}
          onClose={() => setEditingReq(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}

function OwnersDialog({
  requirement,
  area,
  type,
  owners,
  profiles,
  profileById,
  onClose,
  onChanged,
}: {
  requirement: AreaRequirement;
  area: Area;
  type: InspectionType;
  owners: AreaRequirementOwner[];
  profiles: Profile[];
  profileById: Map<string, Profile>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = createClient();
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<"primary" | "backup">(
    "primary",
  );
  const [busy, setBusy] = useState(false);

  const addOwner = async () => {
    if (!selectedProfile) return;
    setBusy(true);

    // Enforce single primary per requirement: if adding a primary,
    // demote any existing primary at this requirement to backup first.
    if (selectedRole === "primary") {
      const { error: demoteError } = await supabase
        .from("area_requirement_owners")
        .update({ owner_role: "backup" })
        .eq("area_requirement_id", requirement.id)
        .eq("owner_role", "primary");
      if (demoteError) {
        setBusy(false);
        toast.error(demoteError.message);
        return;
      }
    }

    const { error } = await supabase.from("area_requirement_owners").insert({
      area_requirement_id: requirement.id,
      profile_id: selectedProfile,
      owner_role: selectedRole,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(
        selectedRole === "primary"
          ? "Primary owner set (previous primary demoted to backup)"
          : "Backup owner added",
      );
      setSelectedProfile("");
      onChanged();
    }
  };

  // Sort: primary first, then backups, then by display name.
  const sortedOwners = [...owners].sort((a, b) => {
    if (a.owner_role !== b.owner_role)
      return a.owner_role === "primary" ? -1 : 1;
    const an = profileById.get(a.profile_id)?.full_name ?? "";
    const bn = profileById.get(b.profile_id)?.full_name ?? "";
    return an.localeCompare(bn);
  });

  const removeOwner = async (id: string) => {
    const target = owners.find((o) => o.id === id);
    setBusy(true);

    // If removing the primary, promote a backup (if any) to primary
    // first so the requirement doesn't end up without a primary.
    let promotedBackupName: string | null = null;
    if (target && target.owner_role === "primary") {
      const backupCandidate = sortedOwners.find(
        (o) => o.id !== id && o.owner_role === "backup",
      );
      if (backupCandidate) {
        const { error: promoteError } = await supabase
          .from("area_requirement_owners")
          .update({ owner_role: "primary" })
          .eq("id", backupCandidate.id);
        if (promoteError) {
          setBusy(false);
          toast.error(promoteError.message);
          return;
        }
        const profile = profileById.get(backupCandidate.profile_id);
        promotedBackupName =
          profile?.full_name || profile?.email || "the backup owner";
      }
    }

    const { error } = await supabase
      .from("area_requirement_owners")
      .delete()
      .eq("id", id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (promotedBackupName) {
      toast.success(`Owner removed — ${promotedBackupName} promoted to primary`);
    } else {
      toast.success("Owner removed");
    }
    onChanged();
  };

  const assignedIds = new Set(owners.map((o) => o.profile_id));
  const availableProfiles = profiles.filter((p) => !assignedIds.has(p.id));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] overflow-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle>
            Owners — {area.name} · {type.abbreviation}
          </DialogTitle>
          <DialogDescription>
            Primary owners receive nudge emails to their inbox; backups are
            CC&apos;d.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {sortedOwners.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No owners assigned yet.
            </p>
          ) : (
            sortedOwners.map((o) => {
              const p = profileById.get(o.profile_id);
              const name = p?.full_name || p?.email || "Unknown";
              return (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-2 border rounded px-3 py-2"
                >
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p
                      className="text-sm font-medium truncate"
                      title={name}
                    >
                      {name}
                    </p>
                    {p?.email && (
                      <p
                        className="text-xs text-muted-foreground truncate"
                        title={p.email}
                      >
                        {p.email}
                      </p>
                    )}
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
                      {o.owner_role}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeOwner(o.id)}
                    disabled={busy}
                    className="shrink-0"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t pt-3 space-y-2">
          <p className="text-sm font-medium">Add owner</p>
          <div className="flex gap-2 flex-wrap">
            <Select
              value={selectedProfile}
              onValueChange={setSelectedProfile}
            >
              {/* Trigger renders its own single-line truncated label so a
                  long-named selection can't push the trigger wider than
                  its column. We bypass SelectValue's default echo of
                  whatever's in the matching SelectItem. */}
              <SelectTrigger
                className="flex-1 min-w-0 basis-[14rem] max-w-full overflow-hidden"
              >
                <SelectedOwnerLabel
                  profile={
                    selectedProfile
                      ? profileById.get(selectedProfile)
                      : undefined
                  }
                />
              </SelectTrigger>
              <SelectContent
                className="w-[var(--radix-select-trigger-width)] max-w-[min(20rem,calc(100vw-2rem))]"
              >
                {availableProfiles.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    All active users assigned
                  </div>
                ) : (
                  availableProfiles.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={p.id}
                      className="py-1.5"
                    >
                      <div className="flex flex-col items-start gap-0.5 min-w-0 max-w-full overflow-hidden">
                        <span
                          className="block w-full font-medium truncate"
                          title={p.full_name ?? p.email}
                        >
                          {p.full_name || p.email}
                        </span>
                        {p.full_name && (
                          <span
                            className="block w-full text-xs text-muted-foreground truncate"
                            title={p.email}
                          >
                            {p.email}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Select
              value={selectedRole}
              onValueChange={(v) =>
                setSelectedRole(v as "primary" | "backup")
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="backup">Backup</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={addOwner}
              disabled={busy || !selectedProfile}
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Single-line truncated label rendered inside the owner SelectTrigger.
 * Bypasses Radix's SelectValue, which by default echoes the matching
 * SelectItem's full ReactNode children — that would force the trigger
 * to expand to accommodate multi-line item content.
 */
function SelectedOwnerLabel({ profile }: { profile?: Profile }) {
  if (!profile) {
    return (
      <span className="block w-full truncate text-left text-muted-foreground">
        Select user
      </span>
    );
  }
  const label = profile.full_name || profile.email;
  return (
    <span
      className="block w-full truncate text-left"
      title={label}
    >
      {label}
    </span>
  );
}
