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
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Recipient } from "@/lib/types";

export function RecipientsAdmin({ recipients }: { recipients: Recipient[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState<Recipient | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ email: "", full_name: "" });
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setDraft({ email: "", full_name: "" });
    setCreating(true);
  };
  const openEdit = (r: Recipient) => {
    setDraft({ email: r.email, full_name: r.full_name ?? "" });
    setEditing(r);
  };

  const save = async () => {
    setBusy(true);
    if (editing) {
      const { error } = await supabase
        .from("recipients")
        .update({ email: draft.email, full_name: draft.full_name || null })
        .eq("id", editing.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Recipient updated");
        setEditing(null);
      }
    } else {
      const { error } = await supabase.from("recipients").insert({
        email: draft.email,
        full_name: draft.full_name || null,
      });
      if (error) toast.error(error.message);
      else {
        toast.success("Recipient added");
        setCreating(false);
      }
    }
    setBusy(false);
    router.refresh();
  };

  const toggleActive = async (r: Recipient) => {
    const { error } = await supabase
      .from("recipients")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else router.refresh();
  };

  const deleteRecipient = async (r: Recipient) => {
    if (!confirm(`Remove ${r.email}?`)) return;
    const { error } = await supabase
      .from("recipients")
      .delete()
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Recipient removed");
      router.refresh();
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Add recipient
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Active</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground py-6"
                >
                  No recipients yet. Add stakeholders who should receive the
                  Thursday summary email.
                </TableCell>
              </TableRow>
            ) : (
              recipients.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.email}</TableCell>
                  <TableCell>{r.full_name || "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={() => toggleActive(r)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(r)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRecipient(r)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
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
            <DialogTitle>
              {editing ? "Edit recipient" : "Add recipient"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) =>
                  setDraft({ ...draft, email: e.target.value })
                }
                placeholder="name@stepan.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Name (optional)</label>
              <Input
                value={draft.full_name}
                onChange={(e) =>
                  setDraft({ ...draft, full_name: e.target.value })
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
            <Button onClick={save} disabled={busy || !draft.email}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
