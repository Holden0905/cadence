"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { isPositiveInteger } from "@/lib/validation";
import type { Area } from "@/lib/types";

// Sentinel values for the area-group Select. Radix Select rejects
// the empty string as a value, so we use distinguishable strings.
const GROUP_NONE = "__none__";
const GROUP_NEW = "__new__";

function suggestNextSortOrder(areas: Area[]): number {
  if (areas.length === 0) return 1;
  return Math.max(...areas.map((a) => a.sort_order)) + 1;
}

export function AreasAdmin({
  areas,
  siteId,
}: {
  areas: Area[];
  siteId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Area | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{
    name: string;
    sort_order: number;
    groupMode: "none" | "existing" | "new";
    existingGroup: string;
    newGroupName: string;
  }>({
    name: "",
    sort_order: suggestNextSortOrder(areas),
    groupMode: "none",
    existingGroup: "",
    newGroupName: "",
  });
  const [busy, setBusy] = useState(false);

  const supabase = createClient();

  // Distinct existing group names from the currently-loaded areas,
  // plus the area being edited's original group (if any). The latter
  // guarantees a user can switch back to their starting value even
  // when this area is the sole one holding that group.
  const existingGroups = useMemo(() => {
    const set = new Set<string>();
    for (const a of areas) {
      if (a.area_group) set.add(a.area_group);
    }
    if (editing?.area_group) set.add(editing.area_group);
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  }, [areas, editing]);

  const openCreate = () => {
    setDraft({
      name: "",
      sort_order: suggestNextSortOrder(areas),
      groupMode: "none",
      existingGroup: "",
      newGroupName: "",
    });
    setCreating(true);
  };

  const openEdit = (a: Area) => {
    setDraft({
      name: a.name,
      sort_order: a.sort_order,
      groupMode: a.area_group ? "existing" : "none",
      existingGroup: a.area_group ?? "",
      newGroupName: "",
    });
    setEditing(a);
  };

  const handleGroupSelectChange = (value: string) => {
    if (value === GROUP_NONE) {
      setDraft((d) => ({
        ...d,
        groupMode: "none",
        existingGroup: "",
        newGroupName: "",
      }));
    } else if (value === GROUP_NEW) {
      setDraft((d) => ({
        ...d,
        groupMode: "new",
        existingGroup: "",
      }));
    } else {
      setDraft((d) => ({
        ...d,
        groupMode: "existing",
        existingGroup: value,
        newGroupName: "",
      }));
    }
  };

  const groupSelectValue =
    draft.groupMode === "none"
      ? GROUP_NONE
      : draft.groupMode === "new"
        ? GROUP_NEW
        : draft.existingGroup;

  const validateDraft = (): string | null => {
    const name = draft.name.trim();
    if (!name) return "Name is required";
    if (!isPositiveInteger(draft.sort_order))
      return "Sort order must be a positive integer";
    const conflict = areas.find(
      (a) =>
        a.sort_order === draft.sort_order &&
        (!editing || a.id !== editing.id),
    );
    if (conflict)
      return `Sort order ${draft.sort_order} is already used by "${conflict.name}"`;
    return null;
  };

  const save = async () => {
    const err = validateDraft();
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    const normalizedGroup =
      draft.groupMode === "none"
        ? null
        : draft.groupMode === "new"
          ? draft.newGroupName.trim() || null
          : draft.existingGroup || null;
    if (editing) {
      const { error } = await supabase
        .from("areas")
        .update({
          name: draft.name.trim(),
          sort_order: draft.sort_order,
          area_group: normalizedGroup,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editing.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Area updated");
        setEditing(null);
      }
    } else {
      const { error } = await supabase.from("areas").insert({
        name: draft.name.trim(),
        sort_order: draft.sort_order,
        area_group: normalizedGroup,
        site_id: siteId,
      });
      if (error) toast.error(error.message);
      else {
        toast.success("Area created");
        setCreating(false);
      }
    }
    setBusy(false);
    router.refresh();
  };

  const toggleActive = async (a: Area) => {
    const { error } = await supabase
      .from("areas")
      .update({ is_active: !a.is_active })
      .eq("id", a.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Area ${!a.is_active ? "activated" : "deactivated"}`);
      router.refresh();
    }
  };

  const deleteArea = async (a: Area) => {
    if (
      !confirm(
        `Delete "${a.name}" permanently? Only possible if no inspection requirements reference it — otherwise, deactivate it instead to preserve history.`,
      )
    )
      return;
    const { error } = await supabase.from("areas").delete().eq("id", a.id);
    if (error) {
      const isFkBlock =
        error.code === "23503" ||
        /foreign key|violates|reference/i.test(error.message);
      toast.error(
        isFkBlock
          ? `Can't delete "${a.name}" — it has historical requirements or tasks. Deactivate it instead to preserve history.`
          : error.message,
      );
    } else {
      toast.success("Area deleted");
      router.refresh();
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Add area
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Active</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.sort_order}</TableCell>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell>
                  <Switch
                    checked={a.is_active}
                    onCheckedChange={() => toggleActive(a)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(a)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteArea(a)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={creating || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit area" : "New area"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="area_name">Name</Label>
              <Input
                id="area_name"
                value={draft.name}
                onChange={(e) =>
                  setDraft({ ...draft, name: e.target.value })
                }
                placeholder="Area 35 New Unit"
              />
            </div>
            <div>
              <Label htmlFor="area_sort_order">Sort order</Label>
              <Input
                id="area_sort_order"
                type="number"
                min={1}
                step={1}
                value={draft.sort_order}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    sort_order: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Positive integer, unique within this site.
              </p>
            </div>
            <div>
              <Label htmlFor="area_group">Area group</Label>
              <Select
                value={groupSelectValue}
                onValueChange={handleGroupSelectChange}
              >
                <SelectTrigger id="area_group" className="w-full">
                  <SelectValue placeholder="Select a group..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={GROUP_NONE}>
                    None (ungrouped)
                  </SelectItem>
                  {existingGroups.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                  <SelectItem value={GROUP_NEW}>
                    + Add new group...
                  </SelectItem>
                </SelectContent>
              </Select>
              {draft.groupMode === "new" && (
                <Input
                  className="mt-2"
                  value={draft.newGroupName}
                  onChange={(e) =>
                    setDraft({ ...draft, newGroupName: e.target.value })
                  }
                  placeholder="New group name"
                  autoFocus
                />
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Groups areas in the upload modal&apos;s cross-area
                picker.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !draft.name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
