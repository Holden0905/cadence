"use client";

import { useState } from "react";
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
import { Card } from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { isPositiveInteger } from "@/lib/validation";
import type { Area } from "@/lib/types";

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
    area_group: string;
  }>({
    name: "",
    sort_order: suggestNextSortOrder(areas),
    area_group: "",
  });
  const [busy, setBusy] = useState(false);

  const supabase = createClient();

  const openCreate = () => {
    setDraft({
      name: "",
      sort_order: suggestNextSortOrder(areas),
      area_group: "",
    });
    setCreating(true);
  };

  const openEdit = (a: Area) => {
    setDraft({
      name: a.name,
      sort_order: a.sort_order,
      area_group: a.area_group ?? "",
    });
    setEditing(a);
  };

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
    const normalizedGroup = draft.area_group.trim() || null;
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
              <Input
                id="area_group"
                value={draft.area_group}
                onChange={(e) =>
                  setDraft({ ...draft, area_group: e.target.value })
                }
                placeholder="Area 2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional. Groups areas in the upload modal&apos;s
                cross-area picker. Leave blank for ungrouped.
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
