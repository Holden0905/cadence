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
    if (existing) {
      const { error } = await supabase
        .from("area_requirements")
        .delete()
        .eq("id", existing.id);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("area_requirements").insert({
        area_id: areaId,
        inspection_type_id: typeId,
      });
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
                  return (
                    <td key={t.id} className="px-2 py-1 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleRequirement(a.id, t.id)}
                          className={`size-7 rounded text-xs font-semibold transition cursor-pointer ${
                            req
                              ? "bg-primary text-primary-foreground hover:opacity-90"
                              : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                        >
                          {req ? "✓" : ""}
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
    const { error } = await supabase
      .from("area_requirement_owners")
      .insert({
        area_requirement_id: requirement.id,
        profile_id: selectedProfile,
        owner_role: selectedRole,
      });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Owner added");
      setSelectedProfile("");
      onChanged();
    }
  };

  const removeOwner = async (id: string) => {
    setBusy(true);
    const { error } = await supabase
      .from("area_requirement_owners")
      .delete()
      .eq("id", id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Owner removed");
      onChanged();
    }
  };

  const assignedIds = new Set(owners.map((o) => o.profile_id));
  const availableProfiles = profiles.filter((p) => !assignedIds.has(p.id));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Owners — {area.name} · {type.abbreviation}
          </DialogTitle>
          <DialogDescription>
            Primary owners receive nudge emails to their inbox; backups are
            CC&apos;d.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {owners.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No owners assigned yet.
            </p>
          ) : (
            owners.map((o) => {
              const p = profileById.get(o.profile_id);
              return (
                <div
                  key={o.id}
                  className="flex items-center justify-between border rounded px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {p?.full_name || p?.email || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {o.owner_role}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeOwner(o.id)}
                    disabled={busy}
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
              <SelectTrigger className="flex-1 min-w-[200px]">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {availableProfiles.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    All active users assigned
                  </div>
                ) : (
                  availableProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
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
