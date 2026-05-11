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
import type { Area } from "@/lib/types";

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
  const [draft, setDraft] = useState<{ name: string; sort_order: number }>({
    name: "",
    sort_order: areas.length + 1,
  });
  const [busy, setBusy] = useState(false);

  const supabase = createClient();

  const openCreate = () => {
    setDraft({ name: "", sort_order: areas.length + 1 });
    setCreating(true);
  };

  const openEdit = (a: Area) => {
    setDraft({ name: a.name, sort_order: a.sort_order });
    setEditing(a);
  };

  const save = async () => {
    setBusy(true);
    if (editing) {
      const { error } = await supabase
        .from("areas")
        .update({
          name: draft.name,
          sort_order: draft.sort_order,
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
        name: draft.name,
        sort_order: draft.sort_order,
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
              <label className="text-sm font-medium">Name</label>
              <Input
                value={draft.name}
                onChange={(e) =>
                  setDraft({ ...draft, name: e.target.value })
                }
                placeholder="Area 35 New Unit"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Sort order</label>
              <Input
                type="number"
                value={draft.sort_order}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    sort_order: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
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
            <Button onClick={save} disabled={busy || !draft.name}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
