"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createSiteAction,
  updateSiteAction,
  toggleSiteActiveAction,
} from "@/app/(platform)/admin/sites/actions";
import type { Site } from "@/lib/types";

export function SitesAdmin({ sites }: { sites: Site[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [draft, setDraft] = useState({ name: "", location: "" });
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setDraft({ name: "", location: "" });
    setCreating(true);
  };

  const openEdit = (site: Site) => {
    setDraft({ name: site.name, location: site.location ?? "" });
    setEditing(site);
  };

  const save = async () => {
    setBusy(true);
    const result = editing
      ? await updateSiteAction({
          id: editing.id,
          name: draft.name,
          location: draft.location,
        })
      : await createSiteAction({
          name: draft.name,
          location: draft.location,
        });
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? "Site updated" : "Site created (inspection types seeded)");
    setCreating(false);
    setEditing(null);
    router.refresh();
  };

  const toggleActive = async (site: Site) => {
    const result = await toggleSiteActiveAction(site.id, !site.is_active);
    if ("error" in result) toast.error(result.error);
    else {
      toast.success(`Site ${!site.is_active ? "activated" : "deactivated"}`);
      router.refresh();
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          New site
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="w-32">Active</TableHead>
              <TableHead className="w-24 text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground py-6"
                >
                  No sites yet.
                </TableCell>
              </TableRow>
            ) : (
              sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">{site.name}</TableCell>
                  <TableCell>{site.location || "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={site.is_active}
                      onCheckedChange={() => toggleActive(site)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(site)}
                    >
                      <Pencil className="size-4" />
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
          if (!open && !busy) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit site" : "Create a new site"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="site_name">Name</Label>
              <Input
                id="site_name"
                value={draft.name}
                onChange={(e) =>
                  setDraft({ ...draft, name: e.target.value })
                }
                placeholder="Stepan Northfield"
              />
            </div>
            <div>
              <Label htmlFor="site_location">Location</Label>
              <Input
                id="site_location"
                value={draft.location}
                onChange={(e) =>
                  setDraft({ ...draft, location: e.target.value })
                }
                placeholder="Northfield, IL"
              />
            </div>
            {!editing && (
              <p className="text-xs text-muted-foreground">
                New sites are seeded automatically with the 5 standard
                inspection types (AVO, VEO, OEL, Baghouse, CT Samples).
              </p>
            )}
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
              {busy && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save" : "Create site"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
